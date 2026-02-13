"use client";

import {
    NOTIFICATION_TYPE_BIT_MEDIA_AUTO_APPROVED,
    NOTIFICATION_TYPE_BIT_REQUEST_AVAILABLE,
    NOTIFICATION_TYPE_BIT_REQUEST_DENIED,
    NOTIFICATION_TYPE_BIT_REQUEST_DOWNLOADING,
    NOTIFICATION_TYPE_BIT_REQUEST_FAILED,
    NOTIFICATION_TYPE_BIT_REQUEST_PARTIALLY_AVAILABLE,
    NOTIFICATION_TYPE_BIT_REQUEST_PENDING,
    NOTIFICATION_TYPE_BIT_REQUEST_SUBMITTED,
    NOTIFICATION_TYPE_BIT_SYSTEM_ALERT_HIGH_LATENCY,
    NOTIFICATION_TYPE_BIT_SYSTEM_ALERT_INDEXERS_UNAVAILABLE,
    NOTIFICATION_TYPE_BIT_SYSTEM_ALERT_SERVICE_UNREACHABLE,
    NOTIFICATION_TYPE_BIT_TEST_NOTIFICATION
} from "@/lib/notification-type-bits";

export type NotificationType = {
    id: number;
    name: string;
    description: string;
};

const notificationTypes: NotificationType[] = [
    { id: NOTIFICATION_TYPE_BIT_REQUEST_PENDING, name: "Media Requested", description: "Triggered when a user requests new media" },
    { id: NOTIFICATION_TYPE_BIT_REQUEST_SUBMITTED, name: "Media Approved", description: "Triggered when a request is approved" },
    { id: NOTIFICATION_TYPE_BIT_REQUEST_AVAILABLE, name: "Media Available", description: "Triggered when requested media becomes available" },
    { id: NOTIFICATION_TYPE_BIT_REQUEST_PARTIALLY_AVAILABLE, name: "Media Partially Available", description: "Triggered when some requested episodes are available" },
    { id: NOTIFICATION_TYPE_BIT_REQUEST_DOWNLOADING, name: "Media Downloading", description: "Triggered when requested media enters downloading state" },
    { id: NOTIFICATION_TYPE_BIT_REQUEST_DENIED, name: "Media Declined", description: "Triggered when a request is declined" },
    { id: NOTIFICATION_TYPE_BIT_REQUEST_FAILED, name: "Media Failed", description: "Triggered when media fails to download" },
    { id: NOTIFICATION_TYPE_BIT_MEDIA_AUTO_APPROVED, name: "Media Auto-Approved", description: "Triggered when a request is automatically approved" },
    { id: NOTIFICATION_TYPE_BIT_TEST_NOTIFICATION, name: "Test Notification", description: "Test notification event" },
    { id: NOTIFICATION_TYPE_BIT_SYSTEM_ALERT_HIGH_LATENCY, name: "System Alert: High Latency", description: "Triggered when service health checks exceed the configured latency threshold" },
    { id: NOTIFICATION_TYPE_BIT_SYSTEM_ALERT_SERVICE_UNREACHABLE, name: "System Alert: Service Unreachable", description: "Triggered when Sonarr/Radarr/Prowlarr/Jellyfin cannot be reached" },
    { id: NOTIFICATION_TYPE_BIT_SYSTEM_ALERT_INDEXERS_UNAVAILABLE, name: "System Alert: Indexers Unavailable", description: "Triggered when no enabled indexers are available in Prowlarr" },
];

interface NotificationTypeSelectorProps {
    currentTypes: number;
    onUpdate: (types: number) => void;
    error?: string;
}

export default function NotificationTypeSelector({
    currentTypes,
    onUpdate,
    error,
}: NotificationTypeSelectorProps) {
    const isTypeEnabled = (typeId: number) => (currentTypes & typeId) === typeId;

    const toggleType = (typeId: number) => {
        const newTypes = isTypeEnabled(typeId) ? currentTypes & ~typeId : currentTypes | typeId;
        onUpdate(newTypes);
    };

    return (
        <div className="space-y-4">
            <div>
                <div className="text-sm font-semibold text-white">Notification Types</div>
                <p className="text-xs text-gray-400 mt-1">Choose which media and system events trigger this endpoint.</p>
            </div>
            <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-slate-900/60 px-5 py-4">
                {notificationTypes.map((type, index) => (
                    <div
                        key={type.id}
                        className={`relative flex items-start gap-4 py-4 ${index === 0 ? "pt-0" : ""}`}
                    >
                        <div className="flex h-6 items-center">
                            <input
                                id={`notification-type-${type.id}`}
                                name="notification-types"
                                type="checkbox"
                                className="h-4 w-4 rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500"
                                checked={isTypeEnabled(type.id)}
                                onChange={() => toggleType(type.id)}
                            />
                        </div>
                        <label
                            htmlFor={`notification-type-${type.id}`}
                            className="flex-1 cursor-pointer text-sm leading-6"
                        >
                            <div className="flex flex-col">
                                <span className="font-medium text-white">{type.name}</span>
                                <span className="text-gray-400">{type.description}</span>
                            </div>
                        </label>
                    </div>
                ))}
            </div>
            {error ? <div className="text-sm text-red-400">{error}</div> : null}
        </div>
    );
}
