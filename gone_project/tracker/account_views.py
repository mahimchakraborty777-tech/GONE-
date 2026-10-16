import json
import re
import secrets
import string
import unicodedata
from datetime import datetime, time, timedelta
from functools import wraps

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .database import schema_is_current
from .models import AuthAttempt, Profile


User = get_user_model()
GONE_ID_PATTERN = re.compile(r'^GONE-[A-Z0-9]{6,12}$')
ID_ALPHABET = string.ascii_uppercase + string.digits
RECOVERY_QUESTIONS = [
    {'id': 'first_school', 'label': 'What was the name of your first school?'},
    {'id': 'childhood_nickname', 'label': 'What was your childhood nickname?'},
    {'id': 'first_pet', 'label': 'What was the name of your first pet?'},
    {'id': 'childhood_best_friend', 'label': 'What was your childhood best friend’s name?'},
    {'id': 'memorable_place', 'label': 'What was the name of a memorable childhood place?'},
    {'id': 'favorite_childhood_book', 'label': 'What was your favorite childhood book?'},
]
QUESTION_IDS = {question['id'] for question in RECOVERY_QUESTIONS}
_DUMMY_ANSWER_HASH = make_password('not-a-real-gone-account-answer')


class RequestProblem(Exception):
    def __init__(self, message, status=400):
        self.message = message
        self.status = status
        super().__init__(message)


def _private_response(response):
    response['Cache-Control'] = 'private, no-store'
    return response


def _no_store_response(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        return _private_response(view(request, *args, **kwargs))
    return wrapped


def backend_problem():
    """Fail closed when a production deployment lacks durable account storage."""
    if settings.ON_VERCEL and (
        not settings.PERSISTENT_DATABASE_CONFIGURED
        or not settings.SECRET_KEY_CONFIGURED
        or settings.DEBUG
    ):
        return JsonResponse(
            {'status': 'error', 'message': 'Account services are not configured for this deployment.'},
            status=503,
        )
    if not schema_is_current():
        return JsonResponse(
            {'status': 'error', 'message': 'Account storage is temporarily unavailable.'},
            status=503,
        )
    return None


def api_login_required(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        problem = backend_problem()
        if problem:
            return _private_response(problem)
        if not request.user.is_authenticated:
            return _private_response(JsonResponse({'status': 'error', 'message': 'Sign in to continue.'}, status=401))
        expected_owner = request.headers.get('X-GONE-Account', '')
        if expected_owner and expected_owner != str(request.user.pk):
            return _private_response(JsonResponse(
                {'status': 'error', 'message': 'The signed-in account changed. Reload GONE before continuing.'},
                status=409,
            ))
        return _private_response(view(request, *args, **kwargs))
    return wrapped


def _json_body(request, max_bytes=32768):
    if len(request.body) > max_bytes:
        raise RequestProblem('Request is too large.', 413)
    if request.content_type != 'application/json':
        raise RequestProblem('Send a JSON request.', 415)
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RequestProblem('The request could not be read.') from None
    if not isinstance(data, dict):
        raise RequestProblem('The request must be a JSON object.')
    return data


def _request_json(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        try:
            return view(request, *args, **kwargs)
        except RequestProblem as problem:
            return JsonResponse({'status': 'error', 'message': problem.message}, status=problem.status)
    return wrapped


def normalize_gone_id(value):
    value = str(value or '').strip().upper()
    if value and not value.startswith('GONE-'):
        value = f'GONE-{value}'
    return value


def _generate_gone_id():
    return 'GONE-' + ''.join(secrets.choice(ID_ALPHABET) for _ in range(6))


def normalize_answer(value):
    value = unicodedata.normalize('NFKC', str(value or '')).strip().casefold()
    return re.sub(r'\s+', ' ', value)


def _recovery_lookup_hash(question_1, answer_1, question_2, answer_2):
    pairs = sorted(((question_1, answer_1), (question_2, answer_2)))
    canonical = json.dumps(pairs, ensure_ascii=False, separators=(',', ':'))
    return salted_hmac(
        'gone.recovery.lookup.v1', canonical, secret=settings.SECRET_KEY, algorithm='sha256'
    ).hexdigest()


def _hash_limiter_value(salt, value):
    return salted_hmac(salt, value, secret=settings.SECRET_KEY).hexdigest()


def _client_ip(request):
    """The visitor's IP from a source the visitor cannot forge.

    On Vercel the platform sets x-vercel-forwarded-for and overwrites X-Forwarded-For.
    Locally we use the socket address. X-Real-IP is never trusted: visitors can send any value.
    """
    if settings.ON_VERCEL:
        forwarded = request.META.get('HTTP_X_VERCEL_FORWARDED_FOR', '')
        first = forwarded.split(',')[0].strip() if forwarded else ''
        return first[:64] or 'vercel-unknown'
    return (request.META.get('REMOTE_ADDR') or 'unknown')[:64]


def _client_hash(request):
    # Keep only a keyed digest; never store raw IP addresses.
    return _hash_limiter_value('gone.auth.client.v1', _client_ip(request))


def _identifier_hash(value):
    return _hash_limiter_value('gone.auth.identifier.v1', value[:160])


def _rate_limited(request, purpose, identifier='', ip_limit=8, identifier_limit=5):
    since = timezone.now() - timedelta(minutes=15)
    client_hash = _client_hash(request)
    attempts = AuthAttempt.objects.filter(
        purpose=purpose,
        client_hash=client_hash,
        created_at__gte=since,
    ).count()
    if attempts >= ip_limit:
        return True, client_hash, ''

    identifier_hash = _identifier_hash(identifier) if identifier else ''
    if identifier_hash:
        matching = AuthAttempt.objects.filter(
            purpose=purpose,
            identifier_hash=identifier_hash,
            created_at__gte=since,
        ).count()
        if matching >= identifier_limit:
            return True, client_hash, identifier_hash
    return False, client_hash, identifier_hash


def _record_attempt(purpose, client_hash, identifier_hash=''):
    AuthAttempt.objects.create(
        purpose=purpose,
        client_hash=client_hash,
        identifier_hash=identifier_hash,
    )


def _public_user(user):
    profile = Profile.objects.filter(user=user).first()
    return {
        'id': user.pk,
        'goneId': user.username,
        'displayName': profile.name if profile else '',
        'setupCompleted': bool(profile and profile.onboarding_complete),
    }


def _profile_for(user):
    profile, _ = Profile.objects.get_or_create(user=user)
    return profile


def _mark_active(user):
    profile = _profile_for(user)
    profile.last_active = timezone.now()
    profile.save(update_fields=['last_active', 'updated_at'])


@_no_store_response
@require_GET

def recovery_questions_api(request):
    problem = backend_problem()
    if problem:
        return problem
    return JsonResponse({'questions': RECOVERY_QUESTIONS})


@_no_store_response
@require_POST
@_request_json

def register_api(request):
    problem = backend_problem()
    if problem:
        return problem
    data = _json_body(request)

    limited, client_hash, _ = _rate_limited(request, 'register', ip_limit=20)
    if limited:
        return JsonResponse({'status': 'error', 'message': 'Too many attempts. Try again later.'}, status=429)
    _record_attempt('register', client_hash)

    requested_id = normalize_gone_id(data.get('goneId'))
    if requested_id and not GONE_ID_PATTERN.fullmatch(requested_id):
        raise RequestProblem('Choose a GONE ID in the format GONE-MH7K29 (6–12 letters or numbers).')

    display_name = str(data.get('displayName') or '').strip()
    if len(display_name) > 100:
        raise RequestProblem('Your display name must be 100 characters or fewer.')

    password = str(data.get('password') or '')
    password_confirm = str(data.get('passwordConfirm') or '')
    if password != password_confirm:
        raise RequestProblem('The passwords do not match.')

    question_1 = str(data.get('recoveryQuestion1') or '')
    question_2 = str(data.get('recoveryQuestion2') or '')
    if question_1 not in QUESTION_IDS or question_2 not in QUESTION_IDS or question_1 == question_2:
        raise RequestProblem('Choose exactly two different recovery questions from the list.')

    answer_1 = normalize_answer(data.get('recoveryAnswer1'))
    answer_2 = normalize_answer(data.get('recoveryAnswer2'))
    if not (2 <= len(answer_1) <= 120 and 2 <= len(answer_2) <= 120):
        raise RequestProblem('Enter an answer of 2–120 characters for each recovery question.')

    try:
        validate_password(password, user=User(username=requested_id or 'GONE-ACCOUNT'))
    except ValidationError as exc:
        raise RequestProblem(' '.join(exc.messages)) from None

    candidate = requested_id
    user = None
    for _ in range(8):
        if not candidate:
            candidate = _generate_gone_id()
        try:
            with transaction.atomic():
                user = User.objects.create_user(username=candidate, password=password)
                Profile.objects.create(
                    user=user,
                    name=display_name,
                    recovery_question_1=question_1,
                    recovery_answer_hash_1=make_password(answer_1),
                    recovery_question_2=question_2,
                    recovery_answer_hash_2=make_password(answer_2),
                    recovery_lookup_hash=_recovery_lookup_hash(question_1, answer_1, question_2, answer_2),
                    last_active=timezone.now(),
                )
            break
        except IntegrityError:
            user = None
            if requested_id:
                return JsonResponse(
                    {'status': 'error', 'message': 'This GONE ID is already taken. Please choose another.'},
                    status=409,
                )
            candidate = ''
    if user is None:
        return JsonResponse({'status': 'error', 'message': 'A unique GONE ID could not be created. Try again.'}, status=503)

    login(request, user)
    return JsonResponse({'status': 'ok', 'user': _public_user(user)}, status=201)


@_no_store_response
@require_POST
@_request_json

def login_api(request):
    problem = backend_problem()
    if problem:
        return problem
    data = _json_body(request)
    gone_id = normalize_gone_id(data.get('goneId'))
    password = str(data.get('password') or '')
    id_for_rate_limit = gone_id if len(gone_id) <= 160 else gone_id[:160]

    limited, client_hash, identifier_hash = _rate_limited(
        request,
        'login',
        id_for_rate_limit,
        ip_limit=15,
        identifier_limit=5,
    )
    if limited:
        return JsonResponse({'status': 'error', 'message': 'Too many attempts. Try again later.'}, status=429)

    user = None
    if GONE_ID_PATTERN.fullmatch(gone_id) and password:
        user = authenticate(request, username=gone_id, password=password)
    if user is None or not user.is_active:
        _record_attempt('login', client_hash, identifier_hash)
        return JsonResponse({'status': 'error', 'message': 'The GONE ID or password is incorrect.'}, status=401)

    login(request, user)
    _mark_active(user)
    return JsonResponse({'status': 'ok', 'user': _public_user(user)})


@_no_store_response
@ensure_csrf_cookie
@require_GET
def session_api(request):
    problem = backend_problem()
    if problem:
        return problem
    if request.user.is_authenticated:
        return JsonResponse({'authenticated': True, 'user': _public_user(request.user)})
    return JsonResponse({'authenticated': False, 'user': None})


@_no_store_response
@require_POST
@_request_json

def logout_api(request):
    problem = backend_problem()
    if problem:
        return problem
    logout(request)
    return JsonResponse({'status': 'ok'})


@_no_store_response
@require_POST
@_request_json

def recover_gone_id_api(request):
    problem = backend_problem()
    if problem:
        return problem
    data = _json_body(request)
    question_1 = str(data.get('question1') or '')
    question_2 = str(data.get('question2') or '')
    answer_1 = normalize_answer(data.get('answer1'))
    answer_2 = normalize_answer(data.get('answer2'))

    # Limits per visitor address and per question pair. They are set high enough for many people
    # sharing one network (school, office, mobile carrier). Account-level protection stays in place.
    pair_identifier = 'pair:' + '|'.join(sorted([question_1[:40], question_2[:40]]))
    limited, client_hash, pair_hash = _rate_limited(
        request, 'recovery', pair_identifier, ip_limit=15, identifier_limit=100,
    )
    if limited:
        return JsonResponse({'status': 'error', 'message': 'Too many attempts. Try again later.'}, status=429)
    _record_attempt('recovery', client_hash, pair_hash)

    generic_error = {'status': 'error', 'message': 'We could not verify both answers. Check them and try again.'}
    if (
        question_1 not in QUESTION_IDS
        or question_2 not in QUESTION_IDS
        or question_1 == question_2
        or not (2 <= len(answer_1) <= 120 and 2 <= len(answer_2) <= 120)
    ):
        check_password(answer_1[:120], _DUMMY_ANSWER_HASH)
        check_password(answer_2[:120], _DUMMY_ANSWER_HASH)
        return JsonResponse(generic_error, status=400)

    lookup_hash = _recovery_lookup_hash(question_1, answer_1, question_2, answer_2)
    candidates = Profile.objects.filter(
        recovery_lookup_hash=lookup_hash,
        user__is_active=True,
    ).select_related('user').order_by('pk')[:2]

    matches = []
    for profile in candidates:
        if (profile.recovery_question_1, profile.recovery_question_2) == (question_1, question_2):
            valid_1 = check_password(answer_1, profile.recovery_answer_hash_1)
            valid_2 = check_password(answer_2, profile.recovery_answer_hash_2)
        else:
            valid_1 = check_password(answer_2, profile.recovery_answer_hash_1)
            valid_2 = check_password(answer_1, profile.recovery_answer_hash_2)
        if valid_1 and valid_2 and profile.user_id:
            matches.append(profile.user)

    if not candidates:
        check_password(answer_1, _DUMMY_ANSWER_HASH)
        check_password(answer_2, _DUMMY_ANSWER_HASH)
    if len(matches) != 1:
        return JsonResponse(generic_error, status=400)

    return JsonResponse({'status': 'ok', 'goneId': matches[0].username})


@_no_store_response
@require_GET
@api_login_required

def user_metrics_api(request):
    if not request.user.is_staff:
        return JsonResponse({'status': 'error', 'message': 'Not found.'}, status=404)

    now = timezone.now()
    today = timezone.localdate(now)
    today_start = timezone.make_aware(datetime.combine(today, time.min))
    week_start = today_start - timedelta(days=today.weekday())
    users = User.objects.filter(is_active=True)
    profiles = Profile.objects.filter(user__is_active=True)

    return JsonResponse({
        'registeredUsers': users.count(),
        'newToday': users.filter(date_joined__gte=today_start).count(),
        'newThisWeek': users.filter(date_joined__gte=week_start).count(),
        'activeToday': profiles.filter(last_active__gte=today_start).count(),
        'activeLast7Days': profiles.filter(last_active__gte=now - timedelta(days=7)).count(),
        'activeDefinition': 'A user is active after registration, successful sign-in, or a successful account data save; page reloads and session reads do not update last_active.',
    })


@_no_store_response
@require_GET
def public_stats_api(request):
    """Public, anonymous totals only: a count of people, never names, IDs or ledgers."""
    problem = backend_problem()
    if problem:
        return problem
    count = User.objects.filter(is_active=True, is_staff=False).count()
    return JsonResponse({
        'registeredUsers': count,
    })
