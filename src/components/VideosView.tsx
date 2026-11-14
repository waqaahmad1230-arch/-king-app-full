import VideosFeed from "./VideosFeed";

interface VideosViewProps {
  currentTab?: string;
  isInVideoSection?: boolean;
  onOpenCreatorProfile?: (creatorUid: string) => void;
  onFullScreenChange?: (isFullScreen: boolean) => void;
}

export default function VideosView({
  currentTab = 'VIDEOS',
  isInVideoSection = true,
  onOpenCreatorProfile,
  onFullScreenChange,
}: VideosViewProps = {}) {
  return (
    <div style={{minHeight: "100vh", backgroundColor: "#040812", color: "white"}}>
      <VideosFeed
        currentTab={currentTab}
        isInVideoSection={isInVideoSection}
        onOpenCreatorProfile={onOpenCreatorProfile}
        onFullScreenChange={onFullScreenChange}
      />
    </div>
  );
}
