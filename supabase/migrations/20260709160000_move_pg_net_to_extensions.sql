-- Move pg_net catalog out of public → extensions (Splinter 0014).
-- The net.http_post API stays in the net schema; recreate push triggers after CASCADE.

DROP EXTENSION IF EXISTS pg_net CASCADE;

CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- Push fan-out triggers (from 20260612130000; idempotent recreate)
DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
CREATE TRIGGER trg_notify_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_fanout_on_message();

DROP TRIGGER IF EXISTS trg_notify_romance_like ON public.romance_likes;
CREATE TRIGGER trg_notify_romance_like
  AFTER INSERT ON public.romance_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_fanout_on_romance_like();
