from django.urls import path
from . import views

urlpatterns = [
    path('', views.index_view, name='index'),
    path('api/bokeh/insights/', views.bokeh_insights_api, name='bokeh_insights'),
    path('api/bokeh/savings/', views.bokeh_savings_api, name='bokeh_savings'),
    path('api/state/sync/', views.sync_state_api, name='sync_state'),
    path('api/state/', views.get_state_api, name='get_state'),
    path('api/export-csv/', views.export_csv_view, name='export_csv'),
]
