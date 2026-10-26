-- alias: owner-chosen label from the dashboard; wins over the device-reported
-- name everywhere (peers, --exit, via=) and survives the device restarting.
-- model: what the device says it is, e.g. "OPPO CPH2687".
ALTER TABLE devices ADD COLUMN alias TEXT;
ALTER TABLE devices ADD COLUMN model TEXT;
