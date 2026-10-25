-- Public addresses the agent reports (from iroh's own probes). last_ip only
-- holds the family the presence socket used to reach Cloudflare.
ALTER TABLE devices ADD COLUMN public_ipv4 TEXT;
ALTER TABLE devices ADD COLUMN public_ipv6 TEXT;
