from django.contrib import admin
from unfold.contrib.filters.admin import AutocompleteSelectFilter
from apps.common.admin_mixins import SearchableModelAdmin
from .models import Store, Department, SubDepartment, Area


@admin.register(Area)
class AreaAdmin(SearchableModelAdmin):
    list_display = ('area_id', 'area_name')
    search_fields = ('area_name',)


@admin.register(Store)
class StoreAdmin(SearchableModelAdmin):
    list_display = ('store_id', 'store_name', 'area', 'address',
                    'phone', 'whatsapp_number', 'store_updated_at', 'active')
    list_filter = ('active', ('area', AutocompleteSelectFilter))
    search_fields = ('store_name', 'address', 'phone', 'whatsapp_number')
    autocomplete_fields = ('area', 'manager')
    readonly_fields = ('store_updated_at',)


@admin.register(Department)
class DepartmentAdmin(SearchableModelAdmin):
    list_display = ('department_id', 'department_name')
    search_fields = ('department_name',)


@admin.register(SubDepartment)
class SubDepartmentAdmin(SearchableModelAdmin):
    list_display = ('sub_department_id', 'department', 'sub_department_name')
    list_filter = (('department', AutocompleteSelectFilter),)
    search_fields = ('sub_department_name', 'department__department_name')
    autocomplete_fields = ('department',)
