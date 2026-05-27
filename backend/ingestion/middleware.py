import threading

_thread_locals = threading.local()

def get_current_tenant():
    """
    Get the currently active tenant from the thread-local storage.
    """
    return getattr(_thread_locals, 'tenant', None)

def set_current_tenant(tenant):
    """
    Set the active tenant in the thread-local storage.
    """
    _thread_locals.tenant = tenant

class TenantMiddleware:
    """
    Middleware that captures the requesting user's tenant (if authenticated)
    and stores it in thread-local storage for automatic queryset filtering.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user and request.user.is_authenticated and getattr(request.user, 'tenant', None):
            set_current_tenant(request.user.tenant)
        else:
            set_current_tenant(None)
        
        response = self.get_response(request)
        
        # Clean up to prevent thread leakage
        set_current_tenant(None)
        return response
