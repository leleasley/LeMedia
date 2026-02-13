"use client";

export type NotificationType = {
    id: number;
    name: string;
    description: string;
};

const notificationTypes: NotificationType[] = [
    { id: 1, name: "Media Requested", description: "Triggered when a user requests new media" },
    { id: 2, name: "Media Approved", description: "Triggered when a request is approved" },
    { id: 4, name: "Media Available", description: "Triggered when requested media becomes available" },
    { id: 128, name: "Media Partially Available", description: "Triggered when some requested episodes are available" },
    { id: 256, name: "Media Downloading", description: "Triggered when requested media enters downloading state" },
    { id: 8, name: "Media Declined", description: "Triggered when a request is declined" },
    { id: 16, name: "Media Failed", description: "Triggered when media fails to download" },
    { id: 32, name: "Media Auto-Approved", description: "Triggered when a request is automatically approved" },
    { id: 64, name: "Test Notification", description: "Test notification event" },
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
                <p className="text-xs text-gray-400 mt-1">Choose which request events trigger this endpoint.</p>
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
