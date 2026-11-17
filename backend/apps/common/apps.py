from django.apps import AppConfig


class CommonConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.common'

    def ready(self):
        from apps.common.mcp_utils import patch_mcp_query_tool

        patch_mcp_query_tool()
