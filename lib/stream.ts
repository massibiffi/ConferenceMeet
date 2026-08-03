// Client-side Stream Chat connection.
//
// We never hold the Stream secret here. We fetch a per-user token from the
// `stream-token` Edge Function (which verifies the Supabase session), then
// connect. The client is a singleton so we connect once per app session.
import { StreamChat } from "stream-chat";
import { supabase } from "./supabase";

let client: StreamChat | null = null;
let connecting: Promise<StreamChat> | null = null;

/** Returns a connected StreamChat client, connecting on first call. */
export async function getStreamClient(): Promise<StreamChat> {
  if (client?.userID) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const { data, error } = await supabase.functions.invoke("stream-token");
    if (error) throw new Error(`stream-token failed: ${error.message}`);
    const { token, apiKey, userId } = data as {
      token: string;
      apiKey: string;
      userId: string;
    };

    const c = StreamChat.getInstance(apiKey);
    if (!c.userID) {
      await c.connectUser({ id: userId }, token);
    }
    client = c;
    return c;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/**
 * Open the 1:1 channel between the current user and `peerId`.
 *
 * M2: the channel is created by the `open-channel` Edge Function, which verifies
 * server-side that the two users share an event and neither is banned. The client
 * only *watches* the returned channel — it does not create channels directly (and
 * the Stream `user` role should have create-channel disabled to enforce that).
 */
export async function getDirectChannel(peerId: string) {
  const c = await getStreamClient();

  const { data, error } = await supabase.functions.invoke("open-channel", {
    body: { peerId },
  });
  if (error) throw new Error(`open-channel failed: ${error.message}`);
  const { channelId } = data as { channelId: string };

  const channel = c.channel("messaging", channelId);
  await channel.watch();
  return channel;
}

/** Disconnect on sign-out so the next user connects cleanly. */
export async function disconnectStream() {
  if (client) {
    await client.disconnectUser();
    client = null;
  }
}
