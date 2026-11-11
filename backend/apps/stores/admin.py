from django.contrib import admin
from .models import Store, Department, SubDepartment, Area
from unfold.admin import ModelAdmin


@admin.register(Area)
class AreaAdmin(ModelAdmin):
    list_display = ('area_id', 'area_name')
    search_fields = ('area_name',)


@admin.register(Store)
class StoreAdmin(ModelAdmin):
    list_display = ('store_id', 'store_name', 'area', 'address',
                    'phone', 'whatsapp_number', 'store_updated_at', 'active')
    list_filter = ('active', 'area')
    search_fields = ('store_name', 'address', 'phone', 'whatsapp_number')
    readonly_fields = ('store_updated_at',)


@admin.register(Department)
class DepartmentAdmin(ModelAdmin):
    list_display = ('department_id', 'department_name')
    search_fields = ('department_name',)


@admin.register(SubDepartment)
class SubDepartmentAdmin(ModelAdmin):
    list_display = ('sub_department_id', 'department', 'sub_department_name')
    list_filter = ('department',)
    search_fields = ('sub_department_name', 'department__department_name')
