import Dropdown from '@/components/Common/Dropdown';
import { withProperties } from '@/utils/typeHelpers';
import { Menu } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/solid';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';

type ButtonWithDropdownProps = {
  text: React.ReactNode;
  dropdownIcon?: React.ReactNode;
  buttonType?: 'primary' | 'ghost';
  buttonSize?: 'sm' | 'md';
} & (
  | ({ as?: 'button' } & ButtonHTMLAttributes<HTMLButtonElement>)
  | ({ as: 'a' } & AnchorHTMLAttributes<HTMLAnchorElement>)
);

const ButtonWithDropdown = ({
  text,
  children,
  dropdownIcon,
  className,
  buttonType = 'primary',
  buttonSize = 'md',
  ...props
}: ButtonWithDropdownProps) => {
  const sizeClass = buttonSize === 'sm' ? 'button-sm' : 'button-md';
  const styleClasses = {
    mainButtonClasses: `${sizeClass} text-white border`,
    dropdownSideButtonClasses: `${sizeClass} border`,
  };

  switch (buttonType) {
    case 'ghost':
      styleClasses.mainButtonClasses +=
        ' bg-transparent border-gray-600 hover:border-gray-200 focus:border-gray-100 active:border-gray-100';
      styleClasses.dropdownSideButtonClasses = styleClasses.mainButtonClasses;
      break;
    default:
      styleClasses.mainButtonClasses +=
        ' bg-indigo-600 border-indigo-500 bg-opacity-80 hover:bg-opacity-100 hover:border-indigo-500 active:bg-indigo-700 active:border-indigo-700 focus:ring-blue';
      styleClasses.dropdownSideButtonClasses +=
        ' bg-indigo-600 bg-opacity-80 border-indigo-500 hover:bg-opacity-100 active:bg-opacity-100 focus:ring-blue';
  }

  const TriggerElement = props.as ?? 'button';
  const paddingSizeClass = buttonSize === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  return (
    <Menu as="div" className="relative z-20 inline-flex">
      <TriggerElement
        type="button"
        className={`relative z-10 inline-flex h-full items-center ${paddingSizeClass} font-medium leading-5 transition duration-150 ease-in-out hover:z-20 focus:z-20 focus:outline-none ${
          styleClasses.mainButtonClasses
        } ${children ? 'rounded-l-md' : 'rounded-md'} ${className}`}
        {...(props as Record<string, string>)}
      >
        {text}
      </TriggerElement>
      {children && (
        <span className="relative -ml-px block">
          <Menu.Button
            type="button"
            className={`relative z-10 inline-flex h-full items-center rounded-r-md ${buttonSize === 'sm' ? 'px-1.5 py-1.5 text-xs' : 'px-2 py-2 text-sm'} font-medium leading-5 text-white transition duration-150 ease-in-out hover:z-20 focus:z-20 ${styleClasses.dropdownSideButtonClasses}`}
            aria-label="Expand"
          >
            {dropdownIcon ? (
              <span className="flex h-5 w-5 items-center justify-center">{dropdownIcon}</span>
            ) : (
              <ChevronDownIcon className="h-5 w-5" />
            )}
          </Menu.Button>
          <Dropdown.Items dropdownType={buttonType}>{children}</Dropdown.Items>
        </span>
      )}
    </Menu>
  );
};
export default withProperties(ButtonWithDropdown, { Item: Dropdown.Item });
