import React, { useEffect, useState, useRef } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Play,
    X,
    Sparkles,
    Maximize,
    Minimize,
    Smartphone,
    Monitor,
} from "lucide-react";

interface DashboardUpdate {
    id: number;
    title: string;
    description?: string;
    video_url?: string | null;
    is_vertical?: boolean;
    hide_after?: string | null;
    created_at: string;
    priority?: number;
}

const getYoutubeVideoId = (url?: string | null): string => {
    if (!url) return "";
    try {
        const parsed = new URL(url);

        // Detect YouTube Shorts URL format: /shorts/VIDEO_ID
        if (parsed.pathname.includes("/shorts/")) {
            return parsed.pathname.split("/shorts/")[1]?.split("/")[0]?.split("?")[0] || "";
        }

        if (parsed.hostname.includes("youtu.be")) {
            return parsed.pathname.slice(1).split("/")[0] || "";
        }

        return (
            parsed.searchParams.get("v") ||
            parsed.pathname.split("/").pop() ||
            ""
        );
    } catch {
        return "";
    }
};

const getYoutubeEmbedUrl = (url?: string | null): string => {
    const id = getYoutubeVideoId(url);

    return id
        ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`
        : "";
};

const checkIsVerticalVideo = (item?: DashboardUpdate | null): boolean => {
    if (!item) return false;
    if (typeof item.is_vertical === "boolean") {
        return item.is_vertical;
    }
    if (item.video_url) {
        const lower = item.video_url.toLowerCase();
        if (
            lower.includes("/shorts/") ||
            lower.includes("vertical=true") ||
            lower.includes("portrait=true") ||
            lower.includes("#vertical") ||
            lower.includes("#portrait") ||
            lower.includes("orientation=vertical")
        ) {
            return true;
        }
    }
    return false;
};

export default function DashboardUpdates() {
    const [updates, setUpdates] = useState<DashboardUpdate[]>([]);
    const [current, setCurrent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [video, setVideo] = useState<string | null>(null);
    const [activeIsVertical, setActiveIsVertical] = useState<boolean>(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const modalRef = useRef<HTMLDivElement>(null);

    const token = localStorage.getItem("token");
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

    useEffect(() => {
        let isMounted = true;
        const fetchUpdates = async () => {
            try {
                const headers: Record<string, string> = {
                    "Content-Type": "application/json"
                };
                if (token) {
                    headers["Authorization"] = `Token ${token}`;
                }

                const res = await fetch(`${API_URL}/common/dashboard-updates/`, {
                    headers
                });

                if (res.ok) {
                    const data = await res.json();
                    if (isMounted) {
                        const list: DashboardUpdate[] = Array.isArray(data)
                            ? data
                            : (data.results || []);

                        // Show continuously until the end time is complete
                        const now = new Date();
                        const activeList = list.filter((item) => {
                            if (!item.hide_after) return true;
                            return new Date(item.hide_after) > now;
                        });

                        setUpdates(activeList);
                    }
                }
            } catch (error) {
                console.error("Failed to load dashboard updates:", error);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchUpdates();

        return () => {
            isMounted = false;
        };
    }, [token, API_URL]);

    // Auto carousel - pauses when video popup is open
    useEffect(() => {
        if (updates.length <= 1 || video) return;

        const timer = setInterval(() => {
            setCurrent((prev) => (prev + 1) % updates.length);
        }, 6000);

        return () => clearInterval(timer);
    }, [updates.length, video]);

    // Fullscreen event listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, []);

    // Open video and detect orientation
    const openVideo = (url: string, vertical = false) => {
        setActiveIsVertical(vertical);
        setVideo(url);
    };

    // Request native fullscreen when modal mounts with video
    useEffect(() => {
        if (video && modalRef.current) {
            modalRef.current.requestFullscreen?.().catch(() => {
                // If browser restricts automatic native fullscreen,
                // the modal layout already takes 100% of the screen.
            });
        }
    }, [video]);

    // Toggle fullscreen mode
    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            modalRef.current?.requestFullscreen?.().catch(() => { });
        } else {
            document.exitFullscreen?.().catch(() => { });
        }
    };

    // Close popup and exit fullscreen
    const closeVideo = () => {
        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => { });
        }
        setVideo(null);
    };

    // Keyboard close
    useEffect(() => {
        if (!video) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeVideo();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [video]);

    const next = () => {
        setCurrent((prev) => (prev + 1) % updates.length);
    };

    const previous = () => {
        setCurrent(
            (prev) => (prev - 1 + updates.length) % updates.length
        );
    };

    if (loading || updates.length === 0) return null;

    const update = updates[current];

    const videoId = update?.video_url
        ? getYoutubeVideoId(update.video_url)
        : "";

    if (!update) return null;

    const isCurrentVertical = checkIsVerticalVideo(update);

    return (
        <section className="w-full space-y-4">
            {/* Header */}
            {/* <div className="flex items-center justify-between px-1">
                <div>
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            What's New
                        </h2>
                    </div>

                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Latest updates and tutorials
                    </p>
                </div>

                {updates.length > 1 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                        {current + 1} / {updates.length}
                    </span>
                )}
            </div> */}

            {/* Main Card */}
            <div className="overflow-hidden">
                {/* Update Information */}
                <div className="flex items-center justify-between">
                    <span className=" bg-blue-50 dark:bg-blue-950/60 text-xs font-medium text-blue-700 dark:text-blue-300">
                        NEW UPDATE
                    </span>

                    <span className="text-xs text-gray-400">
                        {new Date(update.created_at).toLocaleDateString()}
                    </span>
                </div>

                {/* Title and Description */}
                <div className="mt-5">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        {update.title}
                    </h3>

                    {update.description && (
                        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-300 whitespace-pre-line">
                            {update.description}
                        </p>
                    )}
                </div>

                {/* YouTube Thumbnail - Adapts to Vertical (Mobile Record) or Horizontal (16:9) */}
                {update.video_url && videoId && (
                    <div className="mt-5 flex justify-center">
                        <button
                            type="button"
                            onClick={() => openVideo(update.video_url!, isCurrentVertical)}
                            aria-label="Watch tutorial video"
                            className={
                                isCurrentVertical
                                    ? "group relative block w-full max-w-[280px] sm:max-w-[310px] aspect-[9/16] overflow-hidden rounded-2xl bg-gray-950 text-left shadow-lg ring-1 ring-gray-800/80 hover:ring-blue-500/50 transition-all cursor-pointer"
                                    : "group relative block w-full overflow-hidden rounded-xl bg-gray-900 text-left aspect-video cursor-pointer"
                            }
                        >
                            {/* Blurred Ambient Backdrop for Vertical Videos so content is never cropped */}
                            {isCurrentVertical && (
                                <img
                                    src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
                                    alt=""
                                    aria-hidden="true"
                                    className="absolute inset-0 h-full w-full object-cover blur-lg opacity-40 scale-125"
                                />
                            )}

                            {/* Main YouTube Thumbnail */}
                            <img
                                src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                                alt={update.title}
                                className={`transition duration-300 group-hover:scale-105 group-hover:opacity-90 ${isCurrentVertical
                                    ? "relative z-10 h-full w-full object-contain"
                                    : "absolute inset-0 h-full w-full object-cover"
                                    }`}
                                onError={(e) => {
                                    e.currentTarget.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                                }}
                            />

                            {/* Dark Overlay */}
                            <div className="absolute inset-0 z-20 bg-black/15 transition group-hover:bg-black/30" />

                            {/* YouTube Play Button */}
                            <div className="absolute inset-0 z-20 flex items-center justify-center">
                                <div
                                    className={`flex items-center justify-center rounded-xl bg-red-600 text-white shadow-xl transition duration-200 group-hover:scale-110 group-hover:bg-red-700 ${isCurrentVertical ? "h-12 w-16" : "h-14 w-20"
                                        }`}
                                >
                                    <Play
                                        size={isCurrentVertical ? 24 : 30}
                                        fill="white"
                                        strokeWidth={1.5}
                                    />
                                </div>
                            </div>


                        </button>
                    </div>
                )}

                {/* Expiry Date */}
                {update.hide_after && (
                    <p className="mt-4 text-xs text-gray-400">
                        Available until{" "}
                        {new Date(update.hide_after).toLocaleDateString()}
                    </p>
                )}
            </div>

            {/* Carousel Controls */}
            {updates.length > 1 && (
                <div className="flex items-center justify-between px-1">
                    {/* Pagination */}
                    <div className="flex items-center gap-2">
                        {updates.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setCurrent(index)}
                                aria-label={`Show update ${index + 1}`}
                                className={`h-2 rounded-full transition-all cursor-pointer ${current === index
                                    ? "w-6 bg-blue-600"
                                    : "w-2 bg-gray-300 dark:bg-gray-700"
                                    }`}
                            />
                        ))}
                    </div>

                    {/* Navigation */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={previous}
                            aria-label="Previous update"
                            className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer"
                        >
                            <ChevronLeft size={19} />
                        </button>

                        <button
                            type="button"
                            onClick={next}
                            aria-label="Next update"
                            className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition cursor-pointer"
                        >
                            <ChevronRight size={19} />
                        </button>
                    </div>
                </div>
            )}

            {/* Video Popup - Full Screen Mode (Dynamic 9:16 Mobile or 16:9 Landscape) */}
            {video && (
                <div
                    ref={modalRef}
                    className="fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/95 p-2 sm:p-4 md:p-6 backdrop-blur-md animate-in fade-in"
                    onClick={closeVideo}
                >
                    <div
                        className={`relative w-full h-full flex flex-col items-center justify-center transition-all duration-300 ${activeIsVertical
                            ? "max-w-md max-h-[94vh]"
                            : "max-w-[96vw] max-h-[92vh]"
                            }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Control Bar: Orientation Switcher + Fullscreen Toggle + Close Button */}
                        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-30 flex items-center gap-2">
                            {/* Manual Orientation Switcher (1-click toggle between 9:16 mobile and 16:9 landscape) */}
                            <button
                                type="button"
                                onClick={() => setActiveIsVertical((prev) => !prev)}
                                aria-label={activeIsVertical ? "Switch to 16:9 Landscape" : "Switch to 9:16 Mobile"}
                                title={activeIsVertical ? "Switch to Landscape (16:9)" : "Switch to Mobile (9:16)"}
                                className="flex h-9 items-center gap-1.5 px-3 rounded-full bg-black/75 border border-white/20 text-white hover:bg-black transition cursor-pointer shadow-lg text-xs font-medium"
                            >
                                {activeIsVertical ? (
                                    <>
                                        <Monitor size={15} />
                                        <span className="hidden sm:inline">16:9</span>
                                    </>
                                ) : (
                                    <>
                                        <Smartphone size={15} />
                                        <span className="hidden sm:inline">9:16</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={toggleFullscreen}
                                aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                                title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 border border-white/20 text-white hover:bg-black transition cursor-pointer shadow-lg"
                            >
                                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                            </button>

                            <button
                                type="button"
                                onClick={closeVideo}
                                aria-label="Close video"
                                title="Close"
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 border border-white/20 text-white hover:bg-black transition cursor-pointer shadow-lg"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Video Player: Adapts seamlessly to 9:16 portrait or 16:9 landscape */}
                        <div className="w-full h-full flex items-center justify-center">
                            <div
                                className={`w-full max-h-full rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10 transition-all duration-300 ${activeIsVertical
                                    ? "aspect-[9/16] h-full max-w-[420px]"
                                    : "aspect-video"
                                    }`}
                            >
                                <iframe
                                    src={getYoutubeEmbedUrl(video)}
                                    title="Update tutorial"
                                    className="h-full w-full"
                                    allow="autoplay; accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                                    allowFullScreen
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
