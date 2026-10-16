import csv
import json
import math
import os
import re

from django.conf import settings
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .account_views import api_login_required
from .bokeh_charts import (
    generate_category_donut,
    generate_monthly_bars,
    generate_savings_journey,
    generate_trend_pulse,
)
from .models import Entry, Profile, Reminder, Split


DATE_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}$')
MAX_STATE_BYTES = 2 * 1024 * 1024


def _json_error(message, status):
    response = JsonResponse({'status': 'error', 'message': message}, status=status)
    response['Cache-Control'] = 'private, no-store'
    return response


def _read_state(request):
    if len(request.body) > MAX_STATE_BYTES:
        return None, _json_error('The ledger is too large to sync.', 413)
    if request.content_type != 'application/json':
        return None, _json_error('Send a JSON request.', 415)
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, _json_error('The ledger could not be read.', 400)
    if not isinstance(data, dict) or data.get('version') != 3:
        return None, _json_error('This ledger version is not supported.', 400)
    try:
        json.dumps(data, allow_nan=False)
    except (TypeError, ValueError):
        return None, _json_error('The ledger contains unsupported values.', 400)
    return data, None


def _text(value, limit, default=''):
    return str(value if value is not None else default).strip()[:limit]


def _number(value, *, positive=False):
    try:
        result = float(value or 0)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(result) or result < 0 or (positive and result <= 0):
        return None
    return result


def _validate_rows(data, key, id_key='id', max_count=5000):
    rows = data.get(key, [])
    if not isinstance(rows, list) or len(rows) > max_count:
        return None, f'The {key} list is invalid or too large.'
    cleaned = []
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            return None, f'The {key} list contains an invalid item.'
        row_id = _text(row.get(id_key), 120)
        if not row_id or row_id in seen:
            return None, f'The {key} list contains a missing or duplicate ID.'
        seen.add(row_id)
        cleaned.append((row_id, row))
    return cleaned, None


def _state_response(state, has_data):
    response = JsonResponse({**state, 'hasData': has_data})
    response['Cache-Control'] = 'private, no-store'
    return response


@ensure_csrf_cookie
@require_GET
def index_view(request):
    """Serve the SPA shell and establish the CSRF cookie for login and account APIs."""
    index_path = os.path.join(settings.BASE_DIR, 'public', 'index.html')
    if os.path.exists(index_path):
        with open(index_path, 'r', encoding='utf-8') as index_file:
            content = index_file.read()
        response = HttpResponse(content, content_type='text/html; charset=utf-8')
        response['Cache-Control'] = 'no-store'
        return response
    return HttpResponse('<h1>GONE Ledger</h1><p>Frontend index.html not found.</p>', status=404)


@require_POST
@api_login_required
def bokeh_insights_api(request):
    """Generate insight charts strictly from the signed-in user's persisted entries."""
    entries = list(Entry.objects.filter(owner=request.user).values(
        'entry_id', 'title', 'amount', 'kind', 'category', 'date', 'source'
    ))
    for entry in entries:
        entry['id'] = entry.pop('entry_id')
    try:
        script_category, div_category = generate_category_donut(entries)
        script_trend, div_trend = generate_trend_pulse(entries)
        script_monthly, div_monthly = generate_monthly_bars(entries)
        response = JsonResponse({
            'status': 'ok',
            'charts': {
                'category': {'script': script_category, 'div': div_category},
                'trend': {'script': script_trend, 'div': div_trend},
                'monthly': {'script': script_monthly, 'div': div_monthly},
            },
        })
        response['Cache-Control'] = 'private, no-store'
        return response
    except Exception as exc:
        print('GONE insights chart failed:', type(exc).__name__)
        return _json_error('Insights are temporarily unavailable.', 500)


@require_POST
@api_login_required
def bokeh_savings_api(request):
    """Generate the savings chart only from this account's persisted data."""
    profile = Profile.objects.filter(user=request.user).first()
    entries = list(Entry.objects.filter(owner=request.user).values(
        'entry_id', 'title', 'amount', 'kind', 'category', 'date', 'source'
    ))
    for entry in entries:
        entry['id'] = entry.pop('entry_id')
    saving_goal = profile.saving_goal if profile else None
    try:
        script, chart_div = generate_savings_journey(entries, saving_goal=saving_goal)
        response = JsonResponse({'status': 'ok', 'charts': {'savings': {'script': script, 'div': chart_div}}})
        response['Cache-Control'] = 'private, no-store'
        return response
    except Exception as exc:
        print('GONE savings chart failed:', type(exc).__name__)
        return _json_error('Savings chart is temporarily unavailable.', 500)


@require_POST
@api_login_required
def sync_state_api(request):
    """Replace one user's state atomically; never read or write unowned legacy rows."""
    data, error = _read_state(request)
    if error:
        return error

    profile_data = data.get('profile', {})
    if not isinstance(profile_data, dict):
        return _json_error('The profile is invalid.', 400)
    name = _text(profile_data.get('name'), 100)
    budget = _number(profile_data.get('budget'))
    monthly_income = _number(profile_data.get('monthlyIncome'))
    saving_goal_raw = data.get('savingGoal')
    saving_goal = None if saving_goal_raw in (None, '') else _number(saving_goal_raw)
    if budget is None or monthly_income is None or (saving_goal_raw not in (None, '') and saving_goal is None):
        return _json_error('Budget, income, or savings goal is invalid.', 400)

    entries, error_message = _validate_rows(data, 'entries')
    if error_message:
        return _json_error(error_message, 400)
    reminders, error_message = _validate_rows(data, 'reminders', max_count=500)
    if error_message:
        return _json_error(error_message, 400)
    splits, error_message = _validate_rows(data, 'splits', max_count=2000)
    if error_message:
        return _json_error(error_message, 400)

    reminder_days = data.get('reminderDays', {})
    if not isinstance(reminder_days, dict):
        return _json_error('Reminder status is invalid.', 400)

    cleaned_entries = []
    for entry_id, row in entries:
        amount = _number(row.get('amount'), positive=True)
        kind = row.get('kind')
        date = _text(row.get('date'), 20)
        if amount is None or kind not in ('spent', 'received') or not DATE_PATTERN.fullmatch(date):
            return _json_error('An entry has invalid amount, type, or date.', 400)
        cleaned_entries.append({
            'entry_id': entry_id,
            'title': _text(row.get('title'), 200, 'Entry') or 'Entry',
            'amount': amount,
            'kind': kind,
            'category': _text(row.get('category'), 50, 'Other') or 'Other',
            'date': date,
            'source': _text(row.get('source'), 50, 'manual') or 'manual',
            'reminder_id': _text(row.get('reminderId'), 100),
            'auto_logged': bool(row.get('autoLogged', False)),
        })

    cleaned_reminders = []
    for reminder_id, row in reminders:
        amount = _number(row.get('amount'), positive=True)
        if amount is None:
            return _json_error('A reminder has an invalid amount.', 400)
        created_on = _text(row.get('createdOn'), 20)
        if created_on and not DATE_PATTERN.fullmatch(created_on):
            return _json_error('A reminder has an invalid date.', 400)
        cleaned_reminders.append({
            'reminder_id': reminder_id,
            'title': _text(row.get('title'), 100, 'Reminder') or 'Reminder',
            'amount': amount,
            'category': _text(row.get('category'), 50, 'Other') or 'Other',
            'icon': _text(row.get('icon'), 20, '✦') or '✦',
            'created_on': created_on,
        })

    cleaned_splits = []
    for split_id, row in splits:
        total = _number(row.get('total'), positive=True)
        friends = row.get('friends')
        date = _text(row.get('date'), 20)
        if total is None or not isinstance(friends, list) or len(friends) > 20 or (date and not DATE_PATTERN.fullmatch(date)):
            return _json_error('A shared bill has invalid details.', 400)
        cleaned_splits.append({
            'split_id': split_id,
            'description': _text(row.get('description'), 200, 'Shared bill') or 'Shared bill',
            'total': total,
            'friends': [_text(friend, 40) for friend in friends if isinstance(friend, str) and _text(friend, 40)],
            'date': date,
        })

    last_seen = _text(data.get('lastSeenDate'), 10)
    last_auto_log = _text(data.get('lastAutoLogDate'), 10)
    if (last_seen and not DATE_PATTERN.fullmatch(last_seen)) or (last_auto_log and not DATE_PATTERN.fullmatch(last_auto_log)):
        return _json_error('Reminder dates are invalid.', 400)

    try:
        with transaction.atomic():
            profile, _ = Profile.objects.get_or_create(user=request.user)
            profile.name = name
            profile.budget = budget
            profile.monthly_income = monthly_income
            profile.saving_goal = saving_goal
            profile.onboarding_complete = bool(data.get('onboardingComplete', False))
            profile.tour_complete = bool(data.get('tourComplete', False))
            profile.setup_version = 1
            profile.reminder_days = reminder_days
            profile.last_seen_date = last_seen
            profile.last_auto_log_date = last_auto_log
            profile.last_active = timezone.now()
            profile.save()

            entry_ids = []
            for row in cleaned_entries:
                entry_ids.append(row['entry_id'])
                Entry.objects.update_or_create(
                    owner=request.user,
                    entry_id=row['entry_id'],
                    defaults={key: value for key, value in row.items() if key != 'entry_id'},
                )
            own_entries = Entry.objects.filter(owner=request.user)
            if entry_ids:
                own_entries.exclude(entry_id__in=entry_ids).delete()
            else:
                own_entries.delete()

            reminder_ids = []
            for row in cleaned_reminders:
                reminder_ids.append(row['reminder_id'])
                Reminder.objects.update_or_create(
                    owner=request.user,
                    reminder_id=row['reminder_id'],
                    defaults={key: value for key, value in row.items() if key != 'reminder_id'},
                )
            own_reminders = Reminder.objects.filter(owner=request.user)
            if reminder_ids:
                own_reminders.exclude(reminder_id__in=reminder_ids).delete()
            else:
                own_reminders.delete()

            split_ids = []
            for row in cleaned_splits:
                split_ids.append(row['split_id'])
                Split.objects.update_or_create(
                    owner=request.user,
                    split_id=row['split_id'],
                    defaults={key: value for key, value in row.items() if key != 'split_id'},
                )
            own_splits = Split.objects.filter(owner=request.user)
            if split_ids:
                own_splits.exclude(split_id__in=split_ids).delete()
            else:
                own_splits.delete()
    except Exception as exc:
        print('GONE account sync failed:', type(exc).__name__)
        return _json_error('Your account could not be saved. Please try again.', 500)

    response = JsonResponse({'status': 'ok', 'saved_entries': len(cleaned_entries)})
    response['Cache-Control'] = 'private, no-store'
    return response


@require_GET
@api_login_required
def get_state_api(request):
    """Return only records owned by the authenticated Django user."""
    profile = Profile.objects.filter(user=request.user).first()
    entries = list(Entry.objects.filter(owner=request.user).values(
        'entry_id', 'title', 'amount', 'kind', 'category', 'date', 'source', 'reminder_id', 'auto_logged'
    ))
    reminders = list(Reminder.objects.filter(owner=request.user).values(
        'reminder_id', 'title', 'amount', 'category', 'icon', 'created_on'
    ))
    splits = list(Split.objects.filter(owner=request.user).values(
        'split_id', 'description', 'total', 'friends', 'date'
    ))

    state = {
        'version': 3,
        'onboardingComplete': bool(profile and profile.onboarding_complete),
        'tourComplete': bool(profile and profile.tour_complete),
        'profile': {
            'name': profile.name if profile else '',
            'budget': profile.budget if profile else 0,
            'monthlyIncome': profile.monthly_income if profile else 0,
        },
        'savingGoal': profile.saving_goal if profile else None,
        'entries': [{
            'id': entry['entry_id'],
            'title': entry['title'],
            'amount': entry['amount'],
            'kind': entry['kind'],
            'category': entry['category'],
            'date': entry['date'],
            'source': entry['source'],
            'reminderId': entry['reminder_id'],
            'autoLogged': entry['auto_logged'],
        } for entry in entries],
        'reminders': [{
            'id': reminder['reminder_id'],
            'title': reminder['title'],
            'amount': reminder['amount'],
            'category': reminder['category'],
            'icon': reminder['icon'],
            'createdOn': reminder['created_on'],
        } for reminder in reminders],
        'reminderDays': profile.reminder_days if profile else {},
        'lastSeenDate': profile.last_seen_date if profile else '',
        'lastAutoLogDate': profile.last_auto_log_date if profile else '',
        'splits': [{
            'id': split['split_id'],
            'description': split['description'],
            'total': split['total'],
            'friends': split['friends'],
            'date': split['date'],
        } for split in splits],
    }
    has_data = bool(
        profile and (
            profile.onboarding_complete
            or profile.tour_complete
            or profile.name
            or profile.budget
            or profile.monthly_income
            or profile.saving_goal
        )
    ) or bool(entries or reminders or splits)
    return _state_response(state, has_data)


def _csv_safe(value):
    text = str(value if value is not None else '')
    return f"'{text}" if text.startswith(('=', '+', '-', '@', '\t', '\r')) else text


@require_GET
@api_login_required
def export_csv_view(request):
    """Download only the signed-in user's entry history."""
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="gone_entries_report.csv"'
    response['Cache-Control'] = 'private, no-store'
    writer = csv.writer(response)
    writer.writerow(['ID', 'Date', 'Type', 'Title', 'Category', 'Amount (INR)', 'Source', 'Auto-Logged'])
    for entry in Entry.objects.filter(owner=request.user).order_by('-date', '-created_at'):
        writer.writerow([
            _csv_safe(entry.entry_id),
            _csv_safe(entry.date),
            entry.kind.upper(),
            _csv_safe(entry.title),
            _csv_safe(entry.category),
            entry.amount,
            _csv_safe(entry.source),
            'Yes' if entry.auto_logged else 'No',
        ])
    return response
