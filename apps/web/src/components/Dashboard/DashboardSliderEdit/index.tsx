"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { getDashboardSliderLabel, DashboardSliderType } from "@/lib/dashboard-sliders";
import CreateSlider from "@/components/Dashboard/CreateSlider";
import { 
  Bars3Icon, 
  ChevronUpIcon, 
  ChevronDownIcon, 
  PencilIcon, 
  XMarkIcon,
  ArrowUturnLeftIcon,
  MagnifyingGlassIcon
} from "@heroicons/react/24/solid";

type DashboardSlider = {
  id: number;
  type: number;
  title: string | null;
  data: string | null;
  enabled: boolean;
  order: number;
  isBuiltIn: boolean;
};

const Position = {
  None: "None",
  Above: "Above",
  Below: "Below",
} as const;

type DashboardSliderEditProps = {
  slider: DashboardSlider;
  onEnable: () => void;
  onDelete: () => void;
  onPositionUpdate: (
    updatedItemId: number,
    position: keyof typeof Position,
    isClickable: boolean
  ) => void;
  children: React.ReactNode;
  disableUpButton: boolean;
  disableDownButton: boolean;
};

export default function DashboardSliderEdit({
  slider,
  children,
  onEnable,
  onDelete,
  onPositionUpdate,
  disableUpButton,
  disableDownButton,
}: DashboardSliderEditProps) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [hoverPosition, setHoverPosition] = useState<keyof typeof Position>(Position.None);
  const [isDragging, setIsDragging] = useState(false);

  const deleteSlider = async () => {
    try {
      const res = await fetch(`/api/v1/settings/dashboard/${slider.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Successfully deleted slider");
      onDelete();
    } catch {
      toast.error("Failed to delete slider");
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("id", slider.id.toString());
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    setHoverPosition(Position.None);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const middlePoint = rect.height / 2;
      const relativeY = e.clientY - rect.top;
      
      if (relativeY < middlePoint) {
        setHoverPosition(Position.Above);
      } else {
        setHoverPosition(Position.Below);
      }
    }
  };

  const handleDragLeave = () => {
    setHoverPosition(Position.None);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const droppedId = Number(e.dataTransfer.getData("id"));
    if (droppedId && droppedId !== slider.id) {
      onPositionUpdate(droppedId, hoverPosition, false);
    }
    setHoverPosition(Position.None);
  };

  const getSliderTitle = (): string => {
    return getDashboardSliderLabel(slider);
  };

  return (
    <div
      key={`dashboard-slider-${slider.id}-editing`}
      data-testid="dashboard-slider-edit-mode"
      className={`relative mb-4 rounded-lg bg-gray-800 shadow-md ${
        isDragging ? "opacity-0" : "opacity-100"
      }`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      ref={ref}
    >
      {hoverPosition === Position.Above && (
        <div className="absolute -top-3 left-0 w-full border-t-4 border-indigo-500" />
      )}
      {hoverPosition === Position.Below && (
        <div className="absolute -bottom-2 left-0 w-full border-t-4 border-indigo-500" />
      )}
      <div className="flex w-full flex-col rounded-t-lg border-t border-l border-r border-gray-800 bg-gray-900 p-4 text-gray-400 md:flex-row md:items-center md:space-x-2">
        <div className={`${slider.data ? "mb-4" : "mb-0"} flex space-x-2 md:mb-0`}>
          <Bars3Icon className="h-6 w-6" />
          <div className="w-7/12 truncate md:w-full">{getSliderTitle()}</div>
        </div>
        <div className={`pointer-events-none ${slider.data ? "mb-4" : ""} flex-1 md:mb-0`}>
          {slider.type === DashboardSliderType.TMDB_SEARCH && slider.data && (
            <div className="inline-flex items-center gap-1 rounded-full border border-gray-600 bg-gray-700 px-3 py-1 text-sm">
              <MagnifyingGlassIcon className="h-4 w-4" />
              <span>{slider.data}</span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {!slider.isBuiltIn && (
            <>
              {!isEditing ? (
                <button
                  className="inline-flex items-center gap-1 rounded-lg bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700"
                  onClick={() => setIsEditing(true)}
                >
                  <PencilIcon className="h-4 w-4" />
                  <span>Edit</span>
                </button>
              ) : (
                <button
                  className="inline-flex items-center gap-1 rounded-lg bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                  onClick={() => setIsEditing(false)}
                >
                  <ArrowUturnLeftIcon className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
              )}
              <button
                data-testid="dashboard-slider-remove-button"
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                onClick={deleteSlider}
              >
                <XMarkIcon className="h-4 w-4" />
                <span>Remove</span>
              </button>
            </>
          )}
          <div className="absolute right-14 top-4 flex px-2 md:relative md:top-0 md:right-0">
            <button
              className="hover:text-white disabled:text-gray-800"
              onClick={() => onPositionUpdate(slider.id, Position.Above, true)}
              disabled={disableUpButton}
            >
              <ChevronUpIcon className="h-7 w-7 md:h-6 md:w-6" />
            </button>
            <button
              className="hover:text-white disabled:text-gray-800"
              onClick={() => onPositionUpdate(slider.id, Position.Below, true)}
              disabled={disableDownButton}
            >
              <ChevronDownIcon className="h-7 w-7 md:h-6 md:w-6" />
            </button>
          </div>
          <div className="absolute top-4 right-4 flex-1 text-right md:relative md:top-0 md:right-0">
            <button
              onClick={onEnable}
              className="group relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              style={{
                backgroundColor: slider.enabled ? "#4F46E5" : "#374151",
              }}
              title="Toggle Visibility"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  slider.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
      {isEditing ? (
        <div className="p-4">
          <CreateSlider
            onCreate={() => {
              onDelete();
              setIsEditing(false);
            }}
            slider={slider}
          />
        </div>
      ) : (
        <div className={`-mt-6 p-4 ${!slider.enabled ? "opacity-50" : ""}`}>
          {children}
        </div>
      )}
    </div>
  );
}
