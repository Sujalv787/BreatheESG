from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from ingestion.views import (
    IngestSAPView, IngestUtilityView, IngestTravelView,
    IngestionRunViewSet, EmissionRecordViewSet
)

router = DefaultRouter()
router.register('runs', IngestionRunViewSet, basename='runs')
router.register('records', EmissionRecordViewSet, basename='records')

urlpatterns = [
    # JWT authentication endpoints
    path('auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    
    # Multipart ingestion endpoints
    path('ingest/sap/', IngestSAPView.as_view(), name='ingest_sap'),
    path('ingest/utility/', IngestUtilityView.as_view(), name='ingest_utility'),
    path('ingest/travel/', IngestTravelView.as_view(), name='ingest_travel'),
    
    # CRUD endpoints for runs and records
    path('', include(router.urls)),
]
