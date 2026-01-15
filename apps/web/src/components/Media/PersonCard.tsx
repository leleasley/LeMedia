import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";

type PersonCardProps = {
  id: number;
  name: string;
  profilePath: string | null;
  knownForDepartment?: string | null;
  imageProxyEnabled?: boolean;
};

export function PersonCard({ 
  id, 
  name, 
  profilePath, 
  knownForDepartment,
  imageProxyEnabled = false
}: PersonCardProps) {
  const profileUrl = profilePath 
    ? `https://image.tmdb.org/t/p/w300${profilePath}`
    : null;

  return (
    <Link
      href={`/person/${id}`}
      className="group relative overflow-hidden rounded-lg bg-gray-800/50 hover:bg-gray-800/70 transition-all duration-200 hover:scale-105"
    >
      <div className="aspect-[2/3] relative">
        {profileUrl ? (
          <Image
            src={profileUrl}
            alt={name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
          />
        ) : (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center">
            <User className="w-16 h-16 text-gray-500" />
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm text-white truncate">{name}</h3>
        {knownForDepartment && (
          <p className="text-xs text-gray-400 truncate mt-1">{knownForDepartment}</p>
        )}
      </div>
    </Link>
  );
}
