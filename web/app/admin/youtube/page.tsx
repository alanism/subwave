import type { Metadata } from 'next';
import YoutubePanel from '@/components/admin/youtube/YoutubePanel';
export const metadata: Metadata = { title: 'YouTube imports' };
export default function YoutubePage() { return <YoutubePanel />; }
