import json
import os
from datetime import timedelta

from django.conf import settings

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from tracker.models import AuthAttempt, Entry, Profile, Reminder, Split


User = get_user_model()
PASSWORD = 'PineRiver!48Stone'
QUESTION_1 = 'first_school'
QUESTION_2 = 'first_pet'
ANSWER_1 = '  River   View School '
ANSWER_2 = 'miso'


def json_post(client, path, payload, **extra):
    return client.post(path, data=json.dumps(payload), content_type='application/json', **extra)


def ledger_payload(title='Lunch', entry_id='entry-1', owner_hint=None):
    payload = {
        'version': 3,
        'onboardingComplete': True,
        'tourComplete': True,
        'profile': {'name': 'Asha', 'budget': 35000, 'monthlyIncome': 65000},
        'savingGoal': 15000,
        'entries': [
            {
                'id': entry_id,
                'title': title,
                'amount': 250,
                'kind': 'spent',
                'category': 'Food',
                'date': timezone.localdate().isoformat(),
                'source': 'manual',
                'reminderId': '',
                'autoLogged': False,
            }
        ],
        'reminders': [
            {'id': 'chai', 'title': 'Chai', 'amount': 20, 'category': 'Food', 'icon': '☕', 'createdOn': ''}
        ],
        'reminderDays': {},
        'lastSeenDate': '',
        'lastAutoLogDate': '',
        'splits': [
            {'id': 'split-1', 'description': 'Dinner', 'total': 1200, 'friends': ['Rohan'], 'date': ''}
        ],
    }
    if owner_hint is not None:
        payload['userId'] = owner_hint
    return payload


class TrackerBackendTests(TestCase):
    def setUp(self):
        self.client = Client()

    def register(self, client=None, gone_id='GONE-MH7K29', display_name='Asha'):
        client = client or self.client
        payload = {
            'goneId': gone_id,
            'displayName': display_name,
            'password': PASSWORD,
            'passwordConfirm': PASSWORD,
            'recoveryQuestion1': QUESTION_1,
            'recoveryAnswer1': ANSWER_1,
            'recoveryQuestion2': QUESTION_2,
            'recoveryAnswer2': ANSWER_2,
        }
        return json_post(client, '/api/auth/register/', payload)

    def test_index_and_recovery_question_list_are_available(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'GONE', response.content)
        self.assertIn('csrftoken', self.client.cookies)

        session = self.client.get('/api/auth/session/')
        self.assertEqual(session.status_code, 200)
        self.assertEqual(session['Cache-Control'], 'private, no-store')

        questions = self.client.get('/api/auth/recovery-questions/')
        self.assertEqual(questions.status_code, 200)
        self.assertEqual(len(questions.json()['questions']), 6)

    def test_account_endpoints_require_authentication(self):
        for method, path in [
            ('get', '/api/state/'),
            ('post', '/api/state/sync/'),
            ('post', '/api/bokeh/insights/'),
            ('post', '/api/bokeh/savings/'),
            ('get', '/api/export-csv/'),
            ('get', '/api/admin/activity/'),
        ]:
            if method == 'get':
                response = self.client.get(path)
            else:
                response = self.client.post(path, data='{}', content_type='application/json')
            self.assertEqual(response.status_code, 401, f'{method.upper()} {path} should require a session')

    def test_authenticated_api_rejects_a_stale_different_account_marker(self):
        registered = self.register()
        self.assertEqual(registered.status_code, 201)
        user = User.objects.get(username='GONE-MH7K29')

        stale = self.client.get('/api/state/', HTTP_X_GONE_ACCOUNT='999999')
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale['Cache-Control'], 'private, no-store')
        self.assertNotIn('entries', stale.json())

        current = self.client.get('/api/state/', HTTP_X_GONE_ACCOUNT=str(user.pk))
        self.assertEqual(current.status_code, 200)

    def test_registration_creates_unique_id_and_only_secure_hashes(self):
        response = self.register(gone_id='')
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data['status'], 'ok')
        self.assertRegex(data['user']['goneId'], r'^GONE-[A-Z0-9]{6}$')
        self.assertEqual(data['user']['displayName'], 'Asha')
        self.assertNotIn('password', json.dumps(data).lower())
        self.assertNotIn('hash', json.dumps(data).lower())

        user = User.objects.get(username=data['user']['goneId'])
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotEqual(user.password, PASSWORD)
        profile = Profile.objects.get(user=user)
        self.assertNotEqual(profile.recovery_answer_hash_1, ANSWER_1)
        self.assertNotEqual(profile.recovery_answer_hash_2, ANSWER_2)
        self.assertTrue(check_password('river view school', profile.recovery_answer_hash_1))
        self.assertTrue(profile.recovery_lookup_hash)
        self.assertIsNotNone(profile.last_active)
        self.assertTrue(self.client.session.get('_auth_user_id'))

    def test_duplicate_gone_id_is_rejected_with_requested_message(self):
        first = self.register()
        self.assertEqual(first.status_code, 201)
        duplicate = self.register()
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(
            duplicate.json()['message'],
            'This GONE ID is already taken. Please choose another.',
        )
        self.assertEqual(User.objects.filter(username='GONE-MH7K29').count(), 1)

    def test_login_logout_and_session_lifecycle(self):
        registered = self.register()
        self.assertEqual(registered.status_code, 201)
        user = User.objects.get(username='GONE-MH7K29')
        profile = Profile.objects.get(user=user)
        original_active = profile.last_active

        json_post(self.client, '/api/auth/logout/', {})
        status = self.client.get('/api/auth/session/')
        self.assertFalse(status.json()['authenticated'])

        wrong = json_post(self.client, '/api/auth/login/', {'goneId': 'GONE-MH7K29', 'password': 'wrong-password'})
        self.assertEqual(wrong.status_code, 401)
        self.assertNotIn('user', wrong.json())

        signed_in = json_post(self.client, '/api/auth/login/', {'goneId': 'gone-mh7k29', 'password': PASSWORD})
        self.assertEqual(signed_in.status_code, 200)
        self.assertEqual(signed_in.json()['user']['goneId'], 'GONE-MH7K29')
        self.assertTrue(self.client.get('/api/auth/session/').json()['authenticated'])
        profile.refresh_from_db()
        self.assertGreaterEqual(profile.last_active, original_active)

        logged_out = json_post(self.client, '/api/auth/logout/', {})
        self.assertEqual(logged_out.status_code, 200)
        self.assertFalse(self.client.get('/api/auth/session/').json()['authenticated'])

    def test_recovery_requires_both_different_questions_and_normalizes_answers(self):
        self.assertEqual(self.register().status_code, 201)
        recovered = json_post(self.client, '/api/auth/recover-gone-id/', {
            'question1': QUESTION_2,
            'answer1': ' MISO ',
            'question2': QUESTION_1,
            'answer2': 'river view school',
        })
        self.assertEqual(recovered.status_code, 200)
        self.assertEqual(recovered.json(), {'status': 'ok', 'goneId': 'GONE-MH7K29'})

        wrong = json_post(self.client, '/api/auth/recover-gone-id/', {
            'question1': QUESTION_1,
            'answer1': 'wrong answer',
            'question2': QUESTION_2,
            'answer2': ANSWER_2,
        })
        self.assertEqual(wrong.status_code, 400)
        self.assertNotIn('goneId', wrong.json())
        self.assertEqual(wrong.json()['message'], 'We could not verify both answers. Check them and try again.')

        duplicate_question = json_post(self.client, '/api/auth/recover-gone-id/', {
            'question1': QUESTION_1,
            'answer1': ANSWER_1,
            'question2': QUESTION_1,
            'answer2': ANSWER_2,
        })
        self.assertEqual(duplicate_question.status_code, 400)
        self.assertNotIn('goneId', duplicate_question.json())

    def test_ambiguous_recovery_does_not_disclose_an_id(self):
        self.assertEqual(self.register(gone_id='GONE-MH7K29').status_code, 201)
        self.assertEqual(self.register(gone_id='GONE-AB1234').status_code, 201)
        recovered = json_post(self.client, '/api/auth/recover-gone-id/', {
            'question1': QUESTION_1,
            'answer1': 'river view school',
            'question2': QUESTION_2,
            'answer2': 'miso',
        })
        self.assertEqual(recovered.status_code, 400)
        self.assertNotIn('goneId', recovered.json())

    def test_csrf_is_required_for_account_mutations(self):
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.get('/')
        payload = {
            'goneId': 'GONE-MH7K29',
            'displayName': 'Asha',
            'password': PASSWORD,
            'passwordConfirm': PASSWORD,
            'recoveryQuestion1': QUESTION_1,
            'recoveryAnswer1': ANSWER_1,
            'recoveryQuestion2': QUESTION_2,
            'recoveryAnswer2': ANSWER_2,
        }
        blocked = json_post(csrf_client, '/api/auth/register/', payload)
        self.assertEqual(blocked.status_code, 403)
        token = csrf_client.cookies['csrftoken'].value
        allowed = json_post(csrf_client, '/api/auth/register/', payload, HTTP_X_CSRFTOKEN=token)
        self.assertEqual(allowed.status_code, 201)

    def test_state_and_exports_are_isolated_and_legacy_rows_remain_unowned(self):
        legacy = Entry.objects.create(
            owner=None,
            entry_id='legacy-unowned',
            title='Legacy private row',
            amount=99,
            kind='spent',
            category='Other',
            date=timezone.localdate().isoformat(),
        )
        client_a, client_b = Client(), Client()
        user_a = self.register(client_a, 'GONE-MH7K29', 'Asha').json()['user']
        user_b = self.register(client_b, 'GONE-AB1234', 'Mira').json()['user']

        saved = json_post(client_a, '/api/state/sync/', ledger_payload('Private lunch', owner_hint=user_b['id']))
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(Entry.objects.filter(owner_id=user_a['id']).count(), 1)
        legacy.refresh_from_db()
        self.assertIsNone(legacy.owner_id)

        account_a = client_a.get('/api/state/').json()
        account_b = client_b.get('/api/state/').json()
        self.assertEqual([entry['title'] for entry in account_a['entries']], ['Private lunch'])
        self.assertTrue(account_a['tourComplete'])
        self.assertEqual(account_b['entries'], [])
        self.assertFalse(account_b['tourComplete'])
        self.assertEqual(account_b['profile']['name'], 'Mira')

        export_a = client_a.get('/api/export-csv/')
        export_b = client_b.get('/api/export-csv/')
        self.assertEqual(export_a.status_code, 200)
        self.assertIn(b'Private lunch', export_a.content)
        self.assertNotIn(b'Private lunch', export_b.content)
        self.assertNotIn(b'Legacy private row', export_a.content)
        self.assertNotIn(b'Legacy private row', export_b.content)

        rejected = client_b.get('/api/admin/activity/')
        self.assertEqual(rejected.status_code, 404)

    def test_state_sync_updates_last_active_and_does_not_delete_other_owners(self):
        client_a, client_b = Client(), Client()
        response_a = self.register(client_a, 'GONE-MH7K29', 'Asha')
        response_b = self.register(client_b, 'GONE-AB1234', 'Mira')
        user_a = User.objects.get(username=response_a.json()['user']['goneId'])
        user_b = User.objects.get(username=response_b.json()['user']['goneId'])
        Entry.objects.create(owner=user_b, entry_id='other-entry', title='Other account', amount=42, kind='spent', category='Other', date=timezone.localdate().isoformat())

        synced = json_post(client_a, '/api/state/sync/', ledger_payload('Own account'))
        self.assertEqual(synced.status_code, 200)
        self.assertTrue(Entry.objects.filter(owner=user_b, entry_id='other-entry').exists())
        self.assertTrue(Entry.objects.filter(owner=user_a, entry_id='entry-1').exists())

        Profile.objects.filter(user=user_a).update(last_active=timezone.now() - timedelta(days=3))
        old_activity = Profile.objects.get(user=user_a).last_active
        session = client_a.get('/api/auth/session/')
        self.assertTrue(session.json()['authenticated'])
        self.assertEqual(Profile.objects.get(user=user_a).last_active, old_activity)
        client_a.get('/')
        self.assertEqual(Profile.objects.get(user=user_a).last_active, old_activity)
        json_post(client_a, '/api/state/sync/', ledger_payload('Own account updated'))
        self.assertGreater(Profile.objects.get(user=user_a).last_active, old_activity)

    def test_vercel_fails_closed_without_durable_postgres(self):
        with override_settings(
            ON_VERCEL=True,
            PERSISTENT_DATABASE_CONFIGURED=False,
            SECRET_KEY_CONFIGURED=True,
            DEBUG=False,
        ):
            response = self.client.get('/api/auth/session/')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response['Cache-Control'], 'private, no-store')
        self.assertFalse(response.json()['status'] == 'ok')

    def test_bokeh_charts_use_only_signed_in_users_data(self):
        client_a, client_b = Client(), Client()
        self.register(client_a, 'GONE-MH7K29', 'Asha')
        self.register(client_b, 'GONE-AB1234', 'Mira')
        saved = json_post(client_a, '/api/state/sync/', ledger_payload('Cafe meal'))
        self.assertEqual(saved.status_code, 200)

        for path, chart_keys in [
            ('/api/bokeh/insights/', {'category', 'trend', 'monthly'}),
            ('/api/bokeh/savings/', {'savings'}),
        ]:
            response_a = json_post(client_a, path, {})
            response_b = json_post(client_b, path, {})
            self.assertEqual(response_a.status_code, 200)
            self.assertEqual(response_b.status_code, 200)
            self.assertTrue(chart_keys.issubset(response_a.json()['charts']))
            self.assertTrue(chart_keys.issubset(response_b.json()['charts']))
            self.assertNotIn('Cafe meal', json.dumps(response_b.json()))

    def test_activity_metrics_are_staff_only_and_distinguish_registered_from_active(self):
        self.register(self.client, 'GONE-MH7K29', 'Asha')
        user = User.objects.get(username='GONE-MH7K29')
        user.is_staff = True
        user.save(update_fields=['is_staff'])

        metrics = self.client.get('/api/admin/activity/')
        self.assertEqual(metrics.status_code, 200)
        data = metrics.json()
        self.assertEqual(data['registeredUsers'], 1)
        self.assertEqual(data['newToday'], 1)
        self.assertEqual(data['newThisWeek'], 1)
        self.assertEqual(data['activeToday'], 1)
        self.assertEqual(data['activeLast7Days'], 1)
        self.assertIn('page reloads', data['activeDefinition'])
        self.assertNotIn('liveUsers', data)

    def test_csv_export_is_downloadable_and_neutralizes_formula_cells(self):
        self.register()
        user = User.objects.get(username='GONE-MH7K29')
        Entry.objects.create(
            owner=user,
            entry_id='e1',
            title='=HYPERLINK("https://example.com")',
            amount=850,
            kind='spent',
            category='Shopping',
            date=timezone.localdate().isoformat(),
        )
        response = self.client.get('/api/export-csv/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn(b"'=HYPERLINK", response.content)
        self.assertIn('attachment', response['Content-Disposition'])


class SecurityHardeningTests(TestCase):
    """Phase 3 regression tests: one or more per security fix."""

    def _post(self, client, url, body, **extra):
        return client.post(url, json.dumps(body), content_type='application/json',
                           **{'HTTP_X_GONE_CLIENT': '1', **extra})

    def _register_payload(self, gone_id, password='Correct-horse-42!'):
        return {'goneId': gone_id, 'displayName': 'Tester', 'password': password, 'passwordConfirm': password,
                'recoveryQuestion1': 'first_pet', 'recoveryAnswer1': 'rex',
                'recoveryQuestion2': 'childhood_nickname', 'recoveryAnswer2': 'bob'}

    def _recover(self, client, answer, q1='first_pet', q2='childhood_nickname', **extra):
        return self._post(client, '/api/auth/recover-gone-id/',
                          {'question1': q1, 'question2': q2, 'answer1': answer, 'answer2': 'bob'}, **extra)

    # --- rate limiting cannot be bypassed by a visitor-supplied header ---
    def test_spoofed_x_real_ip_does_not_reset_recovery_limit(self):
        codes = [self._recover(Client(), f'guess{i}', HTTP_X_REAL_IP=f'10.9.9.{i}').status_code for i in range(17)]
        self.assertEqual(codes[:15], [400] * 15)
        self.assertEqual(codes[15:], [429] * 2)

    def test_rotating_source_addresses_hit_the_per_question_cap(self):
        from tracker.account_views import _identifier_hash
        pair = _identifier_hash('pair:childhood_nickname|first_pet')  # same key the view builds
        AuthAttempt.objects.bulk_create([AuthAttempt(purpose='recovery', client_hash='y' * 64,
                                                     identifier_hash=pair) for _ in range(100)])
        self.assertEqual(self._recover(Client(REMOTE_ADDR='10.2.0.1'), 'anyone').status_code, 429)

    def test_client_ip_on_vercel_uses_platform_header_not_x_real_ip(self):
        from tracker.account_views import _client_ip
        from django.test import RequestFactory
        req = RequestFactory().post('/', REMOTE_ADDR='10.0.0.1',
                                    HTTP_X_VERCEL_FORWARDED_FOR='203.0.113.7, 10.0.0.1',
                                    HTTP_X_REAL_IP='6.6.6.6')
        with override_settings(ON_VERCEL=True):
            self.assertEqual(_client_ip(req), '203.0.113.7')
        with override_settings(ON_VERCEL=False):
            self.assertEqual(_client_ip(req), '10.0.0.1')

    # --- schema changes never happen inside a visitor request ---
    def test_visitor_requests_do_not_run_migrations(self):
        import tracker.database as database
        self.assertFalse(hasattr(database, 'call_command'))
        self.assertTrue(database.schema_is_current())

    def test_no_entry_point_runs_migrations(self):
        import pathlib
        for path in ['gone_project/wsgi.py', 'gone_project/settings.py', 'tracker/database.py', 'tracker/views.py', 'tracker/account_views.py']:
            source = pathlib.Path(settings.BASE_DIR, path).read_text(encoding='utf-8')
            self.assertNotIn('call_command', source, path)
            self.assertNotIn("'migrate'", source, path)

    # --- public count: anonymous totals only ---
    def test_public_stats_returns_only_totals(self):
        User.objects.create_user(username='GONE-PUBLIC1', password='Correct-horse-42!')
        User.objects.create_user(username='GONE-PUBLIC2', password='Correct-horse-42!')
        User.objects.create_superuser(username='GONE-STAFF01', password='Correct-horse-42!', email='')
        data = Client().get('/api/public/stats/', **{'HTTP_X_GONE_CLIENT': '1'}).json()
        self.assertEqual(data['registeredUsers'], 2)
        self.assertEqual(set(data), {'registeredUsers'})
        self.assertNotIn('GONE-PUBLIC1', json.dumps(data))

    def test_public_stats_count_goes_up_with_each_registration(self):
        c = Client()
        before = c.get('/api/public/stats/').json()['registeredUsers']
        self._post(Client(), '/api/auth/register/', self._register_payload('GONE-GROW0001'))
        self.assertEqual(c.get('/api/public/stats/').json()['registeredUsers'], before + 1)

    # --- browser-facing security headers ---
    def test_pages_send_anti_framing_and_nosniff_headers(self):
        res = Client().get('/')
        self.assertEqual(res.get('X-Frame-Options'), 'DENY')
        self.assertEqual(res.get('X-Content-Type-Options'), 'nosniff')

    # --- dependency hygiene: the page and the server use the same Bokeh version ---
    def test_bokeh_is_pinned_and_unused_packages_are_gone(self):
        import bokeh
        root = settings.BASE_DIR
        reqs = open(os.path.join(root, 'requirements.txt'), encoding='utf-8').read()
        html = open(os.path.join(root, 'public', 'index.html'), encoding='utf-8').read()
        self.assertIn(f'bokeh=={bokeh.__version__}', reqs)
        self.assertNotIn('pandas', reqs)
        self.assertNotIn('numpy', reqs)
        self.assertIn(f'bokeh-{bokeh.__version__}.min.js', html)
