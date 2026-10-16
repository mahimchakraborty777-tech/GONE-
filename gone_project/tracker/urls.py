from django.urls import path
from . import account_views, views

urlpatterns = [
    path('', views.index_view, name='index'),
    path('api/auth/register/', account_views.register_api, name='auth_register'),
    path('api/auth/login/', account_views.login_api, name='auth_login'),
    path('api/auth/session/', account_views.session_api, name='auth_session'),
    path('api/auth/logout/', account_views.logout_api, name='auth_logout'),
    path('api/auth/recovery-questions/', account_views.recovery_questions_api, name='auth_recovery_questions'),
    path('api/auth/recover-gone-id/', account_views.recover_gone_id_api, name='auth_recover_gone_id'),
    path('api/public/stats/', account_views.public_stats_api, name='public_stats'),
    path('api/admin/activity/', account_views.user_metrics_api, name='user_activity_metrics'),
    path('api/bokeh/insights/', views.bokeh_insights_api, name='bokeh_insights'),
    path('api/bokeh/savings/', views.bokeh_savings_api, name='bokeh_savings'),
    path('api/state/sync/', views.sync_state_api, name='sync_state'),
    path('api/state/', views.get_state_api, name='get_state'),
    path('api/export-csv/', views.export_csv_view, name='export_csv'),
]
