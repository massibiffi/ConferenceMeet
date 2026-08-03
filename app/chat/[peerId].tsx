import { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack, useLocalSearchParams } from "expo-router";
import type { Channel as ChannelType, StreamChat } from "stream-chat";
import {
  Channel,
  Chat,
  MessageInput,
  MessageList,
  OverlayProvider,
} from "stream-chat-expo";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { getStreamClient, getDirectChannel } from "@/lib/stream";
import { colors } from "@/lib/theme";

// stream-chat and stream-chat-expo each carry their own "default generics" type.
// They're structurally the same but nominally distinct, so we narrow at the
// component boundary rather than sprinkling `any`.
type ChatClientProp = ComponentProps<typeof Chat>["client"];
type ChannelProp = ComponentProps<typeof Channel>["channel"];

export default function ChatScreen() {
  const { t } = useTranslation();
  const { peerId, peerName } = useLocalSearchParams<{
    peerId: string;
    peerName?: string;
  }>();
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<ChannelType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const c = await getStreamClient();
        const ch = await getDirectChannel(peerId);
        if (active) {
          setClient(c);
          setChannel(ch);
        }
      } catch (e) {
        if (active) setError(String(e));
      }
    })();
    return () => {
      active = false;
    };
  }, [peerId]);

  if (error) {
    return (
      <Centered>
        <Text style={styles.err}>{t("chat.errorTitle")}</Text>
        <Text style={styles.muted}>{error}</Text>
        <Text style={styles.muted}>{t("chat.errorHint")}</Text>
      </Centered>
    );
  }

  if (!client || !channel) {
    return (
      <Centered>
        <ActivityIndicator color={colors.accent} />
      </Centered>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: peerName || t("chat.title") }} />
      <OverlayProvider>
        <Chat client={client as unknown as ChatClientProp}>
          <Channel channel={channel as unknown as ChannelProp}>
            <MessageList />
            <MessageInput />
          </Channel>
        </Chat>
      </OverlayProvider>
    </GestureHandlerRootView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
    backgroundColor: colors.bg,
  },
  err: { fontWeight: "700", color: colors.text, fontSize: 16 },
  muted: { color: colors.muted, textAlign: "center" },
});
