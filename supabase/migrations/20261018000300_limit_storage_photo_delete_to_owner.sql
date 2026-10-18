-- A public photo may be read by others, but only the route/run owner may delete it.
-- Keep the existing restrictive delete boundary as defense in depth.
ALTER POLICY cycling_book_route_objects_delete ON storage.objects
  USING (
    bucket_id = 'route-photos'
    AND (
      public.can_access_route_photo_object(name)
      OR public.can_access_run_photo_object(name)
    )
  );
