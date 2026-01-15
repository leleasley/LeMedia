-- Create table for web push subscriptions
CREATE TABLE IF NOT EXISTS push_subscription (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscription_user_id ON push_subscription(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscription_last_used ON push_subscription(last_used_at NULLS LAST);
