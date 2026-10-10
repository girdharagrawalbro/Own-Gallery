from functools import wraps
from django.core.cache import cache
from rest_framework.response import Response

def get_user_cache_version(user_id, resource):
    """Get the current cache version for a user and resource, or initialize it to 1."""
    key = f"cache_version:user_{user_id}:{resource}"
    version = cache.get(key)
    if not version:
        version = 1
        cache.set(key, version, timeout=None)
    return version

def increment_user_cache_version(user_id, resource):
    """Increment the cache version to instantly invalidate all cached items for this resource."""
    key = f"cache_version:user_{user_id}:{resource}"
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=None)

def user_cache_page(resource, timeout=60 * 15):
    """
    Decorator for DRF views/actions to cache responses per-user and per-resource version.
    Usage:
        @user_cache_page("media")
        def list(self, request, *args, **kwargs): ...
        
        Or on the class:
        @method_decorator(user_cache_page("media"), name='list')
        class MediaViewSet(...)
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped_view(*args, **kwargs):
            request = args[0] if hasattr(args[0], 'user') else args[1]
            if not request.user.is_authenticated or request.method not in ('GET', 'HEAD'):
                return view_func(*args, **kwargs)
            
            # Security: Do not cache private gallery requests.
            if "is_private=true" in request.get_full_path() or request.headers.get("X-Private-Token"):
                return view_func(*args, **kwargs)
                
            user_id = request.user.id
            version = get_user_cache_version(user_id, resource)
            
            # Construct a unique key based on the request URL and query params
            path = request.get_full_path()
            cache_key = f"api:user_{user_id}:{resource}:v{version}:{path}"
            
            cached_data = cache.get(cache_key)
            if cached_data is not None:
                return Response(cached_data)
                
            response = view_func(*args, **kwargs)
            
            # Only cache 200 OK responses
            if response.status_code == 200:
                cache.set(cache_key, response.data, timeout=timeout)
                
            return response
        return _wrapped_view
    return decorator
