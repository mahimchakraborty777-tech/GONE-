import json
from django.test import TestCase, Client
from tracker.models import Profile, Entry, Split

class TrackerBackendTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_index_view(self):
        """Root view should serve frontend index.html with 200 OK."""
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'GONE', response.content)

    def test_bokeh_insights_api(self):
        """Insights Bokeh API should return components for all 3 charts."""
        payload = {
            'entries': [
                {'id': '1', 'title': 'Pizza', 'amount': 450, 'kind': 'spent', 'category': 'Food', 'date': '2026-10-04'},
                {'id': '2', 'title': 'Uber', 'amount': 300, 'kind': 'spent', 'category': 'Travel', 'date': '2026-10-05'},
                {'id': '3', 'title': 'Recharge', 'amount': 299, 'kind': 'spent', 'category': 'Bills', 'date': '2026-10-06'},
            ]
        }
        response = self.client.post(
            '/api/bokeh/insights/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'ok')
        self.assertIn('category', data['charts'])
        self.assertIn('trend', data['charts'])
        self.assertIn('monthly', data['charts'])
        self.assertIn('div', data['charts']['category'])
        self.assertIn('script', data['charts']['category'])

    def test_bokeh_savings_api(self):
        """Savings Bokeh API should return journey chart components."""
        payload = {
            'entries': [
                {'id': '1', 'title': 'Salary', 'amount': 65000, 'kind': 'received', 'category': 'Income', 'date': '2026-10-01'},
                {'id': '2', 'title': 'Rent', 'amount': 15000, 'kind': 'spent', 'category': 'Bills', 'date': '2026-10-02'},
            ],
            'savingGoal': 20000
        }
        response = self.client.post(
            '/api/bokeh/savings/',
            data=json.dumps(payload),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'ok')
        self.assertIn('savings', data['charts'])
        self.assertIn('div', data['charts']['savings'])
        self.assertIn('script', data['charts']['savings'])

    def test_sync_state_and_get_state(self):
        """Two-way sync should persist profile and entries to DB."""
        payload = {
            'profile': {'name': 'Alex', 'budget': 35000, 'monthlyIncome': 65000},
            'savingGoal': 15000,
            'onboardingComplete': True,
            'entries': [
                {'id': 'test-1', 'title': 'Book', 'amount': 500, 'kind': 'spent', 'category': 'Other', 'date': '2026-10-06', 'source': 'manual', 'reminderId': '', 'autoLogged': False}
            ],
            'splits': [
                {'id': 'sp-1', 'description': 'Chai', 'total': 100, 'friends': ['Rohan'], 'date': '2026-10-06'}
            ]
        }
        res_sync = self.client.post('/api/state/sync/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res_sync.status_code, 200)
        self.assertEqual(Entry.objects.count(), 1)
        self.assertEqual(Profile.objects.first().budget, 35000)

        res_get = self.client.get('/api/state/')
        self.assertEqual(res_get.status_code, 200)
        data = res_get.json()
        self.assertEqual(data['profile']['name'], 'Alex')
        self.assertEqual(len(data['entries']), 1)

    def test_export_csv(self):
        """CSV export should return downloadable csv."""
        Entry.objects.create(entry_id='e1', title='Groceries', amount=850, kind='spent', category='Shopping', date='2026-10-05')
        response = self.client.get('/api/export-csv/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn(b'Groceries', response.content)
