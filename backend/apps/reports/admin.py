"""
Admin configuration for Reports App.
"""

from django.contrib import admin
from .models import ReportDefinition, ReportGenerationLog

from unfold.admin import ModelAdmin


@admin.register(ReportDefinition)
class ReportDefinitionAdmin(ModelAdmin):
    list_display = ('report_id', 'name', 'data_source', 'theme',
                    'is_public', 'created_by', 'updated_date')
    list_filter = ('data_source', 'theme', 'is_public', 'created_date')
    search_fields = ('name', 'description', 'data_source',
                     'created_by__username')
    readonly_fields = ('created_date', 'updated_date', 'version')


@admin.register(ReportGenerationLog)
class ReportGenerationLogAdmin(ModelAdmin):
    list_display = ('log_id', 'report_name', 'export_format',
                    'row_count', 'duration_ms', 'generated_by', 'generated_date')
    list_filter = ('export_format', 'generated_date', 'data_source')
    search_fields = ('report_name', 'data_source', 'generated_by__username')
    readonly_fields = ('generated_date',)
