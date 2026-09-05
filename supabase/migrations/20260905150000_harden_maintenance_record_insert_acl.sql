-- Route maintenance record creation exclusively through its tenant-aware RPC.

revoke insert on table public.maintenance_records from authenticated;
