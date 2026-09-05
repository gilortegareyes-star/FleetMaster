-- Store the final outcome of each maintenance work item without changing tenant scope.

alter table public.maintenance_work_items
  add column result text;

alter table public.maintenance_work_items
  add constraint maintenance_work_items_result_check
  check (
    result is null
    or result in (
      'completed',
      'partially_completed',
      'follow_up_required',
      'not_completed'
    )
  );
