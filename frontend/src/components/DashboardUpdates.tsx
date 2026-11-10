
import React, { useEffect, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Play,
    X,
    Sparkles,
} from "lucide-react";

interface DashboardUpdate {
    id: number;
    title: string;
    description?: string;
    video_url?: string;
    hide_after?: string | null;
    created_at: string;
    priority?: number;
}

const getYoutubeVideoId = (url?: string | null) => {
    if (!url) return "";
    try {
        const parsed = new URL(url);

        if (parsed.hostname.includes("youtu.be")) {
            return parsed.pathname.slice(1).split("/")[0];
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

const getYoutubeEmbedUrl = (url?: string | null) => {
    const id = getYoutubeVideoId(url);

    return id
        ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`
        : "";
};

export default function DashboardUpdates() {
    return
    const [updates, setUpdates] = useState<DashboardUpdate[]>([]);
    const [current, setCurrent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [video, setVideo] = useState<string | null>(null);

    useEffect(() => {
        const fetchUpdates = async () => {
            try {
                // Replace with your API request when ready.

                setUpdates([
                    {
                        id: 1,
                        title: "New Dashboard Features",
                        description:
                            "Check out our latest dashboard improvements.",
                        video_url:
                            "https://youtu.be/oI1Yc3artQM?si=kz033y9qbmJh8Ugb",
                        hide_after: "2026-11-30T23:59:59Z",
                        created_at: "2026-11-09T10:00:00Z",
                        priority: 1,
                    },
                    {
                        id: 2,
                        title: "New Reports Section",
                        description:
                            "Learn how to use the new reporting section.",
                        video_url: undefined,
                        hide_after: null,
                        created_at: "2026-11-09T09:00:00Z",
                        priority: 2,
                    },
                ]);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };

        fetchUpdates();
    }, []);

    // Auto carousel - pauses when video popup is open
    useEffect(() => {
        if (updates.length <= 1 || video) return;

        const timer = setInterval(() => {
            setCurrent((prev) => (prev + 1) % updates.length);
        }, 6000);

        return () => clearInterval(timer);
    }, [updates.length, video]);

    // Close popup
    const closeVideo = () => setVideo(null);

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

    const videoId = update.video_url
        ? getYoutubeVideoId(update.video_url)
        : "";

    return (
        <section className="w-full space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-blue-600" />

                        <h2 className="text-lg font-semibold text-gray-900">
                            What's New
                        </h2>
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                        Latest updates and tutorials
                    </p>
                </div>

                {updates.length > 1 && (
                    <span className="text-sm text-gray-500">
                        {current + 1} / {updates.length}
                    </span>
                )}
            </div>

            {/* Main Card */}
            <div className="
                overflow-hidden rounded-2xl
                border border-gray-200
                bg-white p-5 sm:p-6
                shadow-sm
            ">

                {/* Update Information */}
                <div className="flex items-center justify-between">
                    <span className="
                        rounded-full bg-blue-50
                        px-3 py-1 text-xs font-medium
                        text-blue-700
                    ">
                        NEW UPDATE
                    </span>

                    <span className="text-xs text-gray-400">
                        {new Date(
                            update.created_at
                        ).toLocaleDateString()}
                    </span>
                </div>

                {/* Title and Description */}
                <div className="mt-5">
                    <h3 className="text-xl font-semibold text-gray-900">
                        {update.title}
                    </h3>

                    {update.description && (
                        <p className="
                            mt-2 text-sm leading-6
                            text-gray-500
                        ">
                            {update.description}
                        </p>
                    )}
                </div>

                {/* YouTube Thumbnail */}
                {update.video_url && videoId && (
                    <div className="mt-5">
                        <button
                            type="button"
                            onClick={() => setVideo(update.video_url!)}
                            aria-label="Watch tutorial video"
                            className="
                                group relative block w-full
                                overflow-hidden rounded-xl
                                bg-gray-900 text-left
                                aspect-video
                            "
                        >
                            {/* Actual YouTube Thumbnail */}
                            <img
                                src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
                                alt={update.title}
                                className="
                                    absolute inset-0 h-full w-full
                                    object-cover
                                    transition duration-300
                                    group-hover:scale-105
                                    group-hover:opacity-90
                                "
                                onError={(e) => {
                                    e.currentTarget.src =
                                        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                                }}
                            />

                            {/* Dark Overlay */}
                            <div className="
                                absolute inset-0
                                bg-black/15
                                transition group-hover:bg-black/30
                            " />

                            {/* YouTube Play Button */}
                            <div className="
                                absolute inset-0
                                flex items-center justify-center
                            ">
                                <div className="
                                    flex h-14 w-20
                                    items-center justify-center
                                    rounded-xl bg-red-600
                                    text-white shadow-xl
                                    transition duration-200
                                    group-hover:scale-110
                                    group-hover:bg-red-700
                                ">
                                    <Play
                                        size={30}
                                        fill="white"
                                        strokeWidth={1.5}
                                    />
                                </div>
                            </div>

                            {/* Watch Tutorial Label */}
                            <div className="
                                absolute bottom-3 left-3
                                rounded-md bg-black/70
                                px-3 py-1.5
                                text-xs font-medium text-white
                            ">
                                Watch Tutorial
                            </div>
                        </button>
                    </div>
                )}

                {/* Expiry Date */}
                {update.hide_after && (
                    <p className="mt-4 text-xs text-gray-400">
                        Available until{" "}
                        {new Date(
                            update.hide_after!
                        ).toLocaleDateString()}
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
                                className={`
                                    h-2 rounded-full transition-all
                                    ${current === index
                                        ? "w-6 bg-blue-600"
                                        : "w-2 bg-gray-300"
                                    }
                                `}
                            />
                        ))}
                    </div>

                    {/* Navigation */}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={previous}
                            aria-label="Previous update"
                            className="
                                rounded-lg border border-gray-200
                                p-2 text-gray-600
                                hover:bg-gray-50 transition
                            "
                        >
                            <ChevronLeft size={19} />
                        </button>

                        <button
                            type="button"
                            onClick={next}
                            aria-label="Next update"
                            className="
                                rounded-lg border border-gray-200
                                p-2 text-gray-600
                                hover:bg-gray-50 transition
                            "
                        >
                            <ChevronRight size={19} />
                        </button>
                    </div>
                </div>
            )}

            {/* Video Popup */}
            {video && (
                <div
                    className="
                        fixed inset-0 z-[9999]
                        flex items-center justify-center
                        bg-black/80 p-4 sm:p-6
                        backdrop-blur-sm
                    "
                    onClick={closeVideo}
                >
                    <div
                        className="
                            relative w-full max-w-4xl
                            overflow-hidden rounded-xl
                            bg-black shadow-2xl
                        "
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            type="button"
                            onClick={closeVideo}
                            aria-label="Close video"
                            className="
                                absolute right-3 top-3 z-20
                                flex h-9 w-9 items-center
                                justify-center rounded-full
                                bg-black/70 text-white
                                hover:bg-black transition
                            "
                        >
                            <X size={21} />
                        </button>

                        {/* YouTube Player */}
                        <div className="aspect-video">
                            <iframe
                                src={getYoutubeEmbedUrl(video)}
                                title="Update tutorial"
                                className="h-full w-full"
                                allow="
                                    autoplay;
                                    accelerometer;
                                    clipboard-write;
                                    encrypted-media;
                                    gyroscope;
                                    picture-in-picture;
                                    web-share
                                "
                                allowFullScreen
                            />
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
