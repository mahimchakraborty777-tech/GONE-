import csv
import json
import os
from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .models import Profile, Entry, Reminder, Split
from .bokeh_charts import (
    generate_category_donut,
    generate_trend_pulse,
    generate_monthly_bars,
    generate_savings_journey
)

def index_view(request):
    """Serve the single page application index.html."""
    index_path = os.path.join(settings.BASE_DIR, 'public', 'index.html')
    if os.path.exists(index_path):
        with open(index_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return HttpResponse(content, content_type='text/html; charset=utf-8')
    return HttpResponse("<h1>GONE Ledger</h1><p>Frontend index.html not found.</p>", status=404)


@csrf_exempt
def bokeh_insights_api(request):
    """
    Generate Bokeh charts for Insights screen (#dashboard):
    - Category Donut: #chart-category
    - Spending Pulse (7 days): #chart-trend
    - Six Month Comparisons: #chart-monthly
    """
    entries = []
    if request.method == 'POST':
        try:
            body = json.loads(request.body.decode('utf-8'))
            if 'entries' in body and isinstance(body['entries'], list):
                entries = body['entries']
        except Exception:
            pass

    # If no entries passed from client, query backend database
    if not entries:
        entries = list(Entry.objects.values('entry_id', 'title', 'amount', 'kind', 'category', 'date', 'source'))

    try:
        s_cat, d_cat = generate_category_donut(entries)
        s_trend, d_trend = generate_trend_pulse(entries)
        s_monthly, d_monthly = generate_monthly_bars(entries)

        return JsonResponse({
            'status': 'ok',
            'charts': {
                'category': {'script': s_cat, 'div': d_cat},
                'trend': {'script': s_trend, 'div': d_trend},
                'monthly': {'script': s_monthly, 'div': d_monthly}
            }
        })
    except Exception as exc:
        return JsonResponse({'status': 'error', 'message': str(exc)}, status=500)


@csrf_exempt
def bokeh_savings_api(request):
    """
    Generate Bokeh chart for Savings screen (#savings):
    - Savings Journey: #chart-savings-trend
    """
    entries = []
    goal = None

    if request.method == 'POST':
        try:
            body = json.loads(request.body.decode('utf-8'))
            if 'entries' in body and isinstance(body['entries'], list):
                entries = body['entries']
            if 'savingGoal' in body:
                goal = body['savingGoal']
        except Exception:
            pass

    # If no entries passed, query backend database
    if not entries:
        entries = list(Entry.objects.values('entry_id', 'title', 'amount', 'kind', 'category', 'date', 'source'))
    if goal is None:
        p = Profile.objects.first()
        goal = p.saving_goal if p else 0

    try:
        s_sav, d_sav = generate_savings_journey(entries, saving_goal=goal)
        return JsonResponse({
            'status': 'ok',
            'charts': {
                'savings': {'script': s_sav, 'div': d_sav}
            }
        })
    except Exception as exc:
        return JsonResponse({'status': 'error', 'message': str(exc)}, status=500)


@csrf_exempt
def sync_state_api(request):
    """Two-way sync: receives client state and persists to SQLite database."""
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'POST required'}, status=405)

    try:
        body = json.loads(request.body.decode('utf-8'))

        # 1. Profile
        prof_data = body.get('profile', {})
        p, _ = Profile.objects.get_or_create(id=1)
        if 'name' in prof_data:
            p.name = prof_data['name']
        if 'budget' in prof_data:
            p.budget = float(prof_data['budget'] or 0)
        if 'monthlyIncome' in prof_data:
            p.monthly_income = float(prof_data['monthlyIncome'] or 0)
        if 'savingGoal' in body:
            p.saving_goal = float(body['savingGoal']) if body['savingGoal'] else None
        p.onboarding_complete = bool(body.get('onboardingComplete', True))
        p.save()

        # 2. Entries
        entries_data = body.get('entries', [])
        for item in entries_data:
            eid = item.get('id')
            if not eid:
                continue
            Entry.objects.update_or_create(
                entry_id=eid,
                defaults={
                    'title': item.get('title', 'Entry')[:200],
                    'amount': float(item.get('amount', 0)),
                    'kind': item.get('kind', 'spent'),
                    'category': item.get('category', 'Other')[:50],
                    'date': item.get('date', '')[:20],
                    'source': item.get('source', 'manual')[:50],
                    'reminder_id': item.get('reminderId', '')[:100],
                    'auto_logged': bool(item.get('autoLogged', False))
                }
            )

        # 3. Splits
        splits_data = body.get('splits', [])
        for s in splits_data:
            sid = s.get('id')
            if not sid:
                continue
            Split.objects.update_or_create(
                split_id=sid,
                defaults={
                    'description': s.get('description', 'Shared bill')[:200],
                    'total': float(s.get('total', 0)),
                    'friends': s.get('friends', []),
                    'date': s.get('date', '')[:20]
                }
            )

        return JsonResponse({'status': 'ok', 'saved_entries': len(entries_data)})
    except Exception as exc:
        return JsonResponse({'status': 'error', 'message': str(exc)}, status=500)


def get_state_api(request):
    """Retrieve full database state as JSON."""
    p = Profile.objects.first()
    profile_data = {
        'name': p.name if p else '',
        'budget': p.budget if p else 0,
        'monthlyIncome': p.monthly_income if p else 0
    }
    saving_goal = p.saving_goal if p else None
    onboarding_complete = p.onboarding_complete if p else False

    entries = list(Entry.objects.values(
        'entry_id', 'title', 'amount', 'kind', 'category', 'date', 'source', 'reminder_id', 'auto_logged'
    ))
    formatted_entries = [{
        'id': e['entry_id'],
        'title': e['title'],
        'amount': e['amount'],
        'kind': e['kind'],
        'category': e['category'],
        'date': e['date'],
        'source': e['source'],
        'reminderId': e['reminder_id'],
        'autoLogged': e['auto_logged']
    } for e in entries]

    splits = list(Split.objects.values('split_id', 'description', 'total', 'friends', 'date'))
    formatted_splits = [{
        'id': s['split_id'],
        'description': s['description'],
        'total': s['total'],
        'friends': s['friends'],
        'date': s['date']
    } for s in splits]

    return JsonResponse({
        'version': 3,
        'onboardingComplete': onboarding_complete,
        'profile': profile_data,
        'savingGoal': saving_goal,
        'entries': formatted_entries,
        'splits': formatted_splits
    })


def export_csv_view(request):
    """Download CSV file of all recorded entries."""
    response = HttpResponse(content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="gone_entries_report.csv"'

    writer = csv.writer(response)
    writer.writerow(['ID', 'Date', 'Type', 'Title', 'Category', 'Amount (INR)', 'Source', 'Auto-Logged'])

    for e in Entry.objects.all().order_by('-date'):
        writer.writerow([
            e.entry_id,
            e.date,
            e.kind.upper(),
            e.title,
            e.category,
            e.amount,
            e.source,
            'Yes' if e.auto_logged else 'No'
        ])

    return response
