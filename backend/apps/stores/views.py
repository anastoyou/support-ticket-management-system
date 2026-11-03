from rest_framework import viewsets, exceptions
from .models import Store, Department, SubDepartment, Area, StoreDepartmentThrottle
from .serializers import (
    StoreSerializer, DepartmentSerializer, SubDepartmentSerializer, AreaSerializer,
    SubDepartmentWriteSerializer, StoreDepartmentThrottleSerializer
)

from django.db.models import Count


class AreaViewSet(viewsets.ModelViewSet):
    queryset = Area.objects.annotate(
        store_count=Count('stores')
    )
    serializer_class = AreaSerializer


class StoreViewSet(viewsets.ModelViewSet):
    serializer_class = StoreSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or user.is_anonymous:
            return Store.objects.none()

        role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '')
        user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)]

        query_params = getattr(self.request, 'query_params', getattr(self.request, 'GET', {}))
        all_param = str(query_params.get('all', '')).lower() in ('true', '1')

        is_admin_or_office = (
            user.is_superuser or
            any(r in role_name for r in ['office', 'admin', 'management']) or
            any('office' in g or 'admin' in g or 'management' in g for g in user_groups_lower) or
            user.has_perm('accounts.change_customuser') or
            user.has_perm('accounts.add_customuser') or
            user.has_perm('stores.add_store') or
            all_param
        )

        if is_admin_or_office:
            return Store.objects.all().select_related('area', 'manager').order_by('store_name')

        accessible_store_ids = list(
            user.accessible_stores.values_list('store_id', flat=True)
        )
        return Store.objects.filter(
            store_id__in=accessible_store_ids
        ).select_related('area', 'manager').distinct().order_by('store_name')


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer


class SubDepartmentViewSet(viewsets.ModelViewSet):
    queryset = SubDepartment.objects.all().select_related('department')
    serializer_class = SubDepartmentSerializer

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return SubDepartmentWriteSerializer
        return SubDepartmentSerializer

    def get_queryset(self):
        return super().get_queryset()

    def perform_update(self, serializer):
        if serializer.instance.sub_department_name.lower().strip() == 'office':
            raise exceptions.ValidationError(
                {'detail': 'System sub-department "Office" cannot be modified or updated.'})
        serializer.save()

    def perform_destroy(self, instance):
        if instance.sub_department_name.lower().strip() == 'office':
            raise exceptions.ValidationError(
                {'detail': 'System sub-department "Office" cannot be deleted.'})
        instance.delete()


class ManagerViewSet(viewsets.ModelViewSet):
    from .serializers import ManagerSerializer
    serializer_class = ManagerSerializer

    def get_queryset(self):
        from apps.accounts.models import CustomUser
        from django.db.models import Q
        qs = CustomUser.objects.filter(
            role__role_name__icontains='Store Manager'
        ).select_related('role', 'managed_store').order_by('full_name')

        store = self.request.query_params.get('store')
        if store:
            qs = qs.filter(Q(managed_store__store_id=store) | Q(accessible_stores__store_id=store)).distinct()
        return qs


class StoreDepartmentThrottleViewSet(viewsets.ModelViewSet):
    from .models import StoreDepartmentThrottle
    from .serializers import StoreDepartmentThrottleSerializer
    queryset = StoreDepartmentThrottle.objects.all().select_related('store', 'department')
    serializer_class = StoreDepartmentThrottleSerializer


from rest_framework.decorators import api_view, permission_classes
from rest_framework import permissions
from rest_framework.response import Response


@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([permissions.IsAuthenticated])
def throttle_settings(request):
    """
    Get or update Location Approval Throttle settings across departments,
    stores, and custom store-department overrides.
    - System Administrators can configure all departments, stores, and custom overrides.
    - Office Administrators can only configure throttle limits for their assigned department(s).
    """
    user = request.user
    role_name = (user.role.role_name.lower() if hasattr(user, 'role') and user.role else '')
    user_groups_lower = [g.lower().strip() for g in user.groups.values_list('name', flat=True)]
    
    is_full_admin = (
        user.is_superuser or
        ('admin' in role_name and 'office' not in role_name) or
        any(g == 'administrator' or g == 'admin' for g in user_groups_lower)
    )
    is_office_admin = ('office' in role_name) or any('office' in g for g in user_groups_lower)

    is_admin_or_office = is_full_admin or is_office_admin or (
        user.has_perm('stores.change_department') or
        user.has_perm('stores.change_store')
    )

    if not is_admin_or_office:
        return Response({'detail': 'Only Office Administrators and System Administrators can configure throttle limits.'}, status=403)

    user_dept_ids = list(user.sub_departments.values_list('department_id', flat=True).distinct())

    if request.method == 'GET':
        departments = Department.objects.all().order_by('department_name')
        stores = Store.objects.filter(active=True).order_by('store_name')
        custom_throttles = StoreDepartmentThrottle.objects.all().select_related('store', 'department')

        dept_data = [
            {
                'department_id': d.department_id,
                'department_name': d.department_name,
                'location_approval_throttle': d.location_approval_throttle if d.location_approval_throttle is not None else 5,
                'can_edit': is_full_admin or (d.department_id in user_dept_ids)
            }
            for d in departments
        ]

        store_data = [
            {
                'store_id': s.store_id,
                'store_name': s.store_name,
                'location_approval_throttle': s.location_approval_throttle
            }
            for s in stores
        ]

        custom_data = StoreDepartmentThrottleSerializer(custom_throttles, many=True).data
        for cd in custom_data:
            cd['can_edit'] = is_full_admin or (cd.get('department') in user_dept_ids)

        return Response({
            'departments': dept_data,
            'stores': store_data,
            'custom_throttles': custom_data,
            'is_full_admin': is_full_admin,
            'allowed_department_ids': None if is_full_admin else user_dept_ids
        })

    if request.method == 'POST':
        data = request.data
        target_type = data.get('type')  # 'department' | 'store' | 'store_department'

        if target_type == 'department':
            dept_id = data.get('department_id')
            limit = data.get('throttle_limit')
            if dept_id is None:
                return Response({'error': 'department_id is required.'}, status=400)
            
            # Restrict Office Admin to their department only
            if not is_full_admin and int(dept_id) not in user_dept_ids:
                return Response({'error': 'Office Administrators can only configure throttle limits for their own assigned department.'}, status=403)

            try:
                dept = Department.objects.get(pk=dept_id)
                dept.location_approval_throttle = int(limit) if limit is not None and str(limit).strip() != '' else None
                dept.save(update_fields=['location_approval_throttle'])
                return Response({'success': True, 'department_id': dept.department_id, 'location_approval_throttle': dept.location_approval_throttle})
            except Department.DoesNotExist:
                return Response({'error': 'Department not found.'}, status=404)

        elif target_type == 'store':
            # Global store overrides can only be set by full administrators
            if not is_full_admin:
                return Response({'error': 'Global store overrides can only be set by System Administrators. As an Office Administrator, please select your department to set a store override.'}, status=403)

            store_id = data.get('store_id')
            limit = data.get('throttle_limit')
            if not store_id:
                return Response({'error': 'store_id is required.'}, status=400)
            try:
                store = Store.objects.get(pk=store_id)
                store.location_approval_throttle = int(limit) if limit is not None and str(limit).strip() != '' else None
                store.save(update_fields=['location_approval_throttle'])
                return Response({'success': True, 'store_id': store.store_id, 'location_approval_throttle': store.location_approval_throttle})
            except Store.DoesNotExist:
                return Response({'error': 'Store not found.'}, status=404)

        elif target_type == 'store_department':
            store_id = data.get('store_id')
            dept_id = data.get('department_id')
            limit = data.get('throttle_limit')
            if not store_id or not dept_id or limit is None:
                return Response({'error': 'store_id, department_id, and throttle_limit are required.'}, status=400)

            # Restrict Office Admin to their department only
            if not is_full_admin and int(dept_id) not in user_dept_ids:
                return Response({'error': 'Office Administrators can only configure throttle overrides for their own assigned department.'}, status=403)

            try:
                store = Store.objects.get(pk=store_id)
                dept = Department.objects.get(pk=dept_id)
                obj, _ = StoreDepartmentThrottle.objects.update_or_create(
                    store=store,
                    department=dept,
                    defaults={'throttle_limit': int(limit)}
                )
                res_data = StoreDepartmentThrottleSerializer(obj).data
                res_data['can_edit'] = True
                return Response(res_data)
            except (Store.DoesNotExist, Department.DoesNotExist):
                return Response({'error': 'Invalid store or department ID.'}, status=404)

        return Response({'error': 'Invalid throttle target type. Use "department", "store", or "store_department".'}, status=400)

    if request.method == 'DELETE':
        data = request.data if request.data else request.query_params
        target_type = data.get('type')

        if target_type == 'store':
            if not is_full_admin:
                return Response({'error': 'Global store throttle overrides can only be removed by System Administrators.'}, status=403)
            store_id = data.get('store_id')
            if not store_id:
                return Response({'error': 'store_id is required.'}, status=400)
            Store.objects.filter(pk=store_id).update(location_approval_throttle=None)
            return Response({'success': True, 'message': 'Custom store throttle removed.'})

        elif target_type == 'store_department':
            throttle_id = data.get('id')
            store_id = data.get('store_id')
            dept_id = data.get('department_id')

            qs = StoreDepartmentThrottle.objects.all()
            if throttle_id:
                qs = qs.filter(pk=throttle_id)
            elif store_id and dept_id:
                qs = qs.filter(store_id=store_id, department_id=dept_id)
            else:
                return Response({'error': 'id or (store_id and department_id) is required.'}, status=400)

            instance = qs.first()
            if not instance:
                return Response({'error': 'Throttle override not found.'}, status=404)

            # Restrict Office Admin to their department only
            if not is_full_admin and instance.department_id not in user_dept_ids:
                return Response({'error': 'Office Administrators can only remove throttle overrides for their own assigned department.'}, status=403)

            instance.delete()
            return Response({'success': True, 'message': 'Custom store-department throttle removed.'})

        return Response({'error': 'Invalid delete target type.'}, status=400)



