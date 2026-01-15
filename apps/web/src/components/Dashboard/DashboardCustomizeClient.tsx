"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PencilIcon, PlusIcon, ArrowPathIcon, ArrowDownOnSquareIcon, ArrowUturnLeftIcon } from "@heroicons/react/24/solid";
import { Transition } from "@headlessui/react";

import { useToast } from "@/components/Providers/ToastProvider";
import { DashboardSlider } from "@/lib/dashboard-sliders";
import CreateSlider from "@/components/Dashboard/CreateSlider";
import DashboardSliderEdit from "@/components/Dashboard/DashboardSliderEdit";

const fetcher = (url: string) => fetch(url).then(r => r.json());

const Position = {
  None: "None",
  Above: "Above",
  Below: "Below",
} as const;

type DashboardCustomizeClientProps = {
  sliderComponents: Record<number, React.ReactNode>;
};

export default function DashboardCustomizeClient({ sliderComponents }: DashboardCustomizeClientProps) {
  const toast = useToast();
  const { data: dashboardData, mutate } = useSWR<DashboardSlider[]>("/api/v1/settings/dashboard", fetcher);
  const [sliders, setSliders] = useState<DashboardSlider[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Sync state when data loads or when editing stops
  useEffect(() => {
    if (dashboardData && !isEditing) {
      setSliders(dashboardData);
    }
  }, [dashboardData, isEditing]);

  const hasChanged = () => !Object.is(dashboardData, sliders);

  const updateSliders = async () => {
    try {
      const res = await fetch("/api/v1/settings/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sliders),
      });

      if (!res.ok) throw new Error("Update failed");

      toast.success("Updated dashboard customization settings");
      setIsEditing(false);
      mutate();
    } catch {
      toast.error("Something went wrong updating the dashboard customization settings");
    }
  };

  const resetSliders = async () => {
    try {
      const res = await fetch("/api/v1/settings/dashboard/reset", {
        method: "GET",
      });

      if (!res.ok) throw new Error("Reset failed");

      toast.success("Successfully reset dashboard customization settings");
      setIsEditing(false);
      mutate();
    } catch {
      toast.error("Something went wrong resetting the dashboard customization settings");
    }
  };

  const handlePositionUpdate = (
    updatedItemId: number,
    position: keyof typeof Position,
    hasClickedArrows: boolean
  ) => {
    const originalPosition = sliders.findIndex((item) => item.id === updatedItemId);
    const originalItem = sliders[originalPosition];
    const currentIndex = sliders.findIndex((s) => s.id === updatedItemId);

    const tempSliders = sliders.slice();
    tempSliders.splice(originalPosition, 1);

    if (hasClickedArrows) {
      // For arrow button clicks
      tempSliders.splice(
        position === "Above" ? currentIndex - 1 : currentIndex + 1,
        0,
        originalItem
      );
    } else {
      // For drag and drop
      const targetIndex = tempSliders.findIndex((item) => item !== originalItem);
      tempSliders.splice(
        position === "Above" && currentIndex > originalPosition
          ? Math.max(currentIndex - 1, 0)
          : currentIndex,
        0,
        originalItem
      );
    }

    setSliders(tempSliders);
  };

  return (
    <>
      {isEditing && (
        <div className="my-6 rounded-lg bg-gray-800">
          <div className="flex items-center space-x-2 rounded-t-lg border-t border-l border-r border-gray-800 bg-gray-900 p-4 text-lg font-semibold text-gray-400">
            <PlusIcon className="w-6" />
            <span data-testid="create-slider-header">Create New Slider</span>
          </div>
          <div className="p-4">
            <CreateSlider
              onCreate={async () => {
                const newSliders = await mutate();
                if (newSliders) {
                  setSliders(newSliders);
                }
              }}
            />
          </div>
        </div>
      )}
      <Transition
        show={!isEditing}
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <div className="fixed right-6 bottom-8 z-50 hidden items-center md:flex">
          <button
            onClick={() => setIsEditing(true)}
            data-testid="dashboard-start-editing"
            className="h-12 w-12 rounded-full border-2 border-gray-600 bg-gray-700 bg-opacity-90 p-3 text-gray-400 shadow transition-all hover:bg-opacity-100"
          >
            <PencilIcon className="h-full w-full" />
          </button>
        </div>
      </Transition>
      <Transition
        show={isEditing}
        enter="transition duration-300"
        enterFrom="opacity-0 translate-y-6"
        enterTo="opacity-100 translate-y-0"
        leave="transition duration-300"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-6"
      >
        <div className="fixed right-0 left-0 z-50 flex flex-col items-center justify-end space-x-0 space-y-2 border-t border-gray-700 bg-gray-800 bg-opacity-80 p-4 backdrop-blur bottom-0 sm:flex-row sm:space-y-0 sm:space-x-3">
          <button
            onClick={() => setIsEditing(false)}
            className="w-full sm:w-auto inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
            <span>Stop Editing</span>
          </button>
          <button
            onClick={() => {
              if (confirm("Reset all sliders to default. This will also delete any custom sliders!")) {
                resetSliders();
              }
            }}
            className="w-full sm:w-auto inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600"
          >
            <ArrowPathIcon className="h-4 w-4" />
            <span>Reset to Default</span>
          </button>
          <button
            onClick={() => updateSliders()}
            disabled={!hasChanged()}
            data-testid="dashboard-customize-submit"
            className="w-full sm:w-auto inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowDownOnSquareIcon className="h-4 w-4" />
            <span>Save</span>
          </button>
        </div>
      </Transition>
      {sliders.map((slider, index) => {
        const sliderComponent = sliderComponents[slider.id];

        if (isEditing) {
          return (
            <DashboardSliderEdit
              key={`dashboard-slider-${slider.id}-edit`}
              slider={slider}
              onDelete={async () => {
                const newSliders = await mutate();
                if (newSliders) {
                  setSliders(newSliders);
                }
              }}
              onEnable={() => {
                const tempSliders = sliders.slice();
                tempSliders[index].enabled = !tempSliders[index].enabled;
                setSliders(tempSliders);
              }}
              onPositionUpdate={handlePositionUpdate}
              disableUpButton={index === 0}
              disableDownButton={index === sliders.length - 1}
            >
              {sliderComponent}
            </DashboardSliderEdit>
          );
        }

        if (!slider.enabled) {
          return null;
        }

        return (
          <div key={`dashboard-slider-${slider.id}`}>{sliderComponent}</div>
        );
      })}
    </>
  );
}
