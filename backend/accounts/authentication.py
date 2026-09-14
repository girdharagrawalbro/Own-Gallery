from rest_framework_simplejwt.authentication import JWTAuthentication

class QueryStringJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        # Try to authenticate with the query parameter first
        token = request.query_params.get('token')
        if token:
            try:
                validated_token = self.get_validated_token(token)
                return self.get_user(validated_token), validated_token
            except Exception:
                pass # Fall back to the default header-based auth
        
        # Call the default behavior
        return super().authenticate(request)
