-- Allow push subscription upserts to refresh existing browser/FCM tokens.
drop policy if exists "Users can update subscriptions" on public.push_subscriptions;

create policy "Users can update subscriptions"
  on public.push_subscriptions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
