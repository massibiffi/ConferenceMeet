import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { EventRow } from "./types";

// v1 launches with a single event, but the model is multi-event. This hook picks
// the first event the signed-in user has joined and exposes a refresh.
export function useActiveEvent() {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setEvent(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("event_attendees")
      .select("event_id, events(*)")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();
    // supabase returns the joined row under `events`
    setEvent((data as { events: EventRow } | null)?.events ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { event, loading, refresh: load };
}
