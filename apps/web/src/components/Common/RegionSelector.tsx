"use client";

import useSWR from "swr";
import { Listbox, Transition } from "@headlessui/react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { Fragment } from "react";

interface Region {
  iso_3166_1: string;
  english_name: string;
  native_name: string;
}

interface RegionSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
}

export function RegionSelector({ value, onChange, label = "Region" }: RegionSelectorProps) {
  const { data, isLoading } = useSWR<{ regions: Region[] }>("/api/v1/tmdb/regions");
  const regions = data?.regions ?? [];

  const selectedRegion = regions.find(r => r.iso_3166_1 === value);

  return (
    <div className="w-full">
      {label && <label className="mb-2 block text-sm font-semibold text-white">{label}</label>}
      <Listbox value={value} onChange={onChange}>
        <div className="relative">
          <Listbox.Button className="relative w-full cursor-default rounded-xl border border-white/20 bg-white/5 py-3 pl-4 pr-10 text-left text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:text-sm">
            <span className="block truncate">
              {selectedRegion ? `${selectedRegion.english_name} (${selectedRegion.iso_3166_1})` : "Select a region..."}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </span>
          </Listbox.Button>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-white/10 bg-slate-900 py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
              <Listbox.Option
                key="none"
                className={({ active }) =>
                  `relative cursor-default select-none py-2 pl-10 pr-4 ${
                    active ? 'bg-indigo-600 text-white' : 'text-gray-300'
                  }`
                }
                value={null}
              >
                {({ selected }) => (
                  <>
                    <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                      None (Global)
                    </span>
                    {selected ? (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-400">
                        <CheckIcon className="h-5 w-5" aria-hidden="true" />
                      </span>
                    ) : null}
                  </>
                )}
              </Listbox.Option>
              {regions.map((region) => (
                <Listbox.Option
                  key={region.iso_3166_1}
                  className={({ active }) =>
                    `relative cursor-default select-none py-2 pl-10 pr-4 ${
                      active ? 'bg-indigo-600 text-white' : 'text-gray-300'
                    }`
                  }
                  value={region.iso_3166_1}
                >
                  {({ selected, active }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                        {region.english_name}
                      </span>
                      {selected ? (
                        <span className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-indigo-400'}`}>
                          <CheckIcon className="h-5 w-5" aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  );
}
