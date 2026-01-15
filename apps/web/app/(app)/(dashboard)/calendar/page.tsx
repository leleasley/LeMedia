import { CalendarView } from "@/components/Calendar/CalendarView";

export const metadata = {
  title: "Release Calendar - LeMedia",
};

export default function CalendarPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-white mb-6">Release Calendar</h1>
      <CalendarView />
    </div>
  );
}
