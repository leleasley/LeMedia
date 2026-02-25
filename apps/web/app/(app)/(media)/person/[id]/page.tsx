import Image from "next/image";
import { z } from "zod";
import { getPerson, getPersonCombinedCredits, tmdbImageUrl } from "@/lib/tmdb";
import { MediaCarousel, CarouselItem } from "@/components/Media/MediaCarousel";
import { Calendar, MapPin, Cake, User } from "lucide-react";
import { getImageProxyEnabled } from "@/lib/app-settings";

const Params = z.object({ id: z.coerce.number().int() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

export async function generateMetadata({ params }: { params: ParamsInput }) {
  try {
    const { id } = Params.parse(await resolveParams(params));
    const person = await getPerson(id);
    return {
      title: `${person.name} - LeMedia`,
    };
  } catch {
    return {
      title: "Person - LeMedia",
    };
  }
}

function calculateAge(birthday: string, deathday?: string | null) {
  const birthDate = new Date(birthday);
  const endDate = deathday ? new Date(deathday) : new Date();
  let age = endDate.getFullYear() - birthDate.getFullYear();
  const m = endDate.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && endDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export default async function PersonPage({ params }: { params: ParamsInput }) {
  const imageProxyEnabled = await getImageProxyEnabled();
  let person: any;
  let credits: any;

  try {
    const { id } = Params.parse(await resolveParams(params));
    [person, credits] = await Promise.all([
      getPerson(id),
      getPersonCombinedCredits(id)
    ]);
  } catch (e: any) {
    return (
      <div className="flex h-[50vh] items-center justify-center p-4">
        <div className="glass-strong rounded-2xl p-8 text-center max-w-md">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
            <User className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Unable to load person</h1>
          <p className="text-sm text-gray-400">{e?.message ?? "Unknown error from TMDB."}</p>
        </div>
      </div>
    );
  }

  const profilePath = person.profile_path ? tmdbImageUrl(person.profile_path, "h632", imageProxyEnabled) : null;
  const knownForDep = person.known_for_department;
  
  // Sort credits by popularity and vote count to find "Known For"
  const castCredits = (credits?.cast ?? [])
    .filter((c: any) => c.poster_path && c.vote_count > 10) // Basic filtering
    .sort((a: any, b: any) => b.popularity - a.popularity);

  // Group by movie and tv
  const movieCredits = castCredits.filter((c: any) => c.media_type === "movie");
  const tvCredits = castCredits.filter((c: any) => c.media_type === "tv");

  // Helper to convert to CarouselItem
  const toCarouselItem = (item: any): CarouselItem => ({
    id: item.id,
    title: item.title || item.name,
    posterUrl: tmdbImageUrl(item.poster_path, "w500", imageProxyEnabled),
    year: (item.release_date || item.first_air_date || "").slice(0, 4),
    rating: item.vote_average,
    description: item.overview,
    type: item.media_type,
  });

  const knownForItems = castCredits.slice(0, 20).map(toCarouselItem);
  const movieItems = movieCredits.map(toCarouselItem);
  const tvItems = tvCredits.map(toCarouselItem);

  return (
    <div className="relative min-h-screen pb-20 -mt-14 pt-[10vh] sm:pt-[15vh]">
      <div className="relative z-10 px-3 sm:px-4 md:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-6 sm:gap-8 md:gap-12">
          {/* Profile Image */}
          <div className="flex-shrink-0 mx-auto md:mx-0">
            <div className="w-40 sm:w-56 md:w-72 lg:w-80 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
              {profilePath ? (
                <Image
                  src={profilePath}
                  alt={person.name}
                  width={320}
                  height={480}
                  className="w-full h-auto object-cover"
                  priority
                />
              ) : (
                <div className="aspect-[2/3] bg-white/5 flex items-center justify-center">
                  <User className="h-16 w-16 text-gray-600" />
                </div>
              )}
            </div>
            
            {/* Personal Info Sidebar (Desktop) */}
            <div className="hidden md:block mt-8 space-y-6">
              <h3 className="text-xl font-bold text-white mb-4">Personal Info</h3>
              
              <div className="space-y-4">
                {person.known_for_department && (
                  <div>
                    <div className="text-sm font-medium text-gray-400">Known For</div>
                    <div className="text-white">{person.known_for_department}</div>
                  </div>
                )}
                
                {person.gender !== undefined && (
                  <div>
                    <div className="text-sm font-medium text-gray-400">Gender</div>
                    <div className="text-white">
                      {person.gender === 1 ? "Female" : person.gender === 2 ? "Male" : "Non-binary"}
                    </div>
                  </div>
                )}

                {person.birthday && (
                  <div>
                    <div className="text-sm font-medium text-gray-400">Birthday</div>
                    <div className="text-white">{person.birthday} ({calculateAge(person.birthday, person.deathday)} years old)</div>
                  </div>
                )}

                {person.deathday && (
                  <div>
                    <div className="text-sm font-medium text-gray-400">Day of Death</div>
                    <div className="text-white">{person.deathday}</div>
                  </div>
                )}

                {person.place_of_birth && (
                  <div>
                    <div className="text-sm font-medium text-gray-400">Place of Birth</div>
                    <div className="text-white">{person.place_of_birth}</div>
                  </div>
                )}
                
                {person.also_known_as && person.also_known_as.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-gray-400">Also Known As</div>
                    <ul className="text-sm text-gray-300 space-y-1">
                      {person.also_known_as.slice(0, 5).map((alias: string, i: number) => (
                        <li key={i}>{alias}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight mb-4 sm:mb-6 text-center md:text-left">
              {person.name}
            </h1>

            {person.biography && (
              <div className="mb-6 sm:mb-10">
                <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3">Biography</h3>
                <div className="prose prose-invert max-w-none text-sm sm:text-base text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {person.biography || `We don't have a biography for ${person.name}.`}
                </div>
              </div>
            )}
            
            {/* Known For Carousel */}
            {knownForItems.length > 0 && (
              <div className="mb-6 sm:mb-10">
                <MediaCarousel 
                  title="Known For" 
                  items={knownForItems} 
                  cardMode="requestable"
                />
              </div>
            )}
            
            {/* Movies Carousel */}
            {movieItems.length > 0 && (
               <div className="mb-6 sm:mb-10">
                <MediaCarousel 
                  title="Acting (Movies)" 
                  items={movieItems.slice(0, 20)} 
                  itemType="movie"
                  cardMode="requestable"
                />
              </div>
            )}

            {/* TV Carousel */}
            {tvItems.length > 0 && (
               <div className="mb-6 sm:mb-10">
                <MediaCarousel 
                  title="Acting (TV Shows)" 
                  items={tvItems.slice(0, 20)} 
                  itemType="tv"
                  cardMode="requestable"
                />
              </div>
            )}
            
            {/* Mobile Personal Info - Enhanced for mobile */}
            <div className="md:hidden mt-6 space-y-3 border-t border-white/10 pt-6">
               <h3 className="text-lg font-bold text-white mb-3">Personal Info</h3>
               {person.known_for_department && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Known For</span>
                    <span className="text-gray-200">{person.known_for_department}</span>
                  </div>
                )}
                {person.birthday && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-400">
                      <Cake className="h-4 w-4" />
                      Birthday
                    </span>
                    <span className="text-gray-200">{person.birthday} ({calculateAge(person.birthday, person.deathday)} yrs)</span>
                  </div>
                )}
                {person.deathday && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Died</span>
                    <span className="text-gray-200">{person.deathday}</span>
                  </div>
                )}
                {person.place_of_birth && (
                   <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-gray-400">
                      <MapPin className="h-4 w-4" />
                      Birthplace
                    </span>
                    <span className="text-gray-200 text-right max-w-[60%]">{person.place_of_birth}</span>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
