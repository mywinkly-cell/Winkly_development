import { Redirect } from "expo-router";

export default function EventsChats() {
  return <Redirect href="/chats?mode=events" />;
}
