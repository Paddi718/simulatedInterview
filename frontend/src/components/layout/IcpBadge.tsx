import Link from 'next/link';

export default function IcpBadge() {
  return (
    <div className="text-center py-2">
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        皖ICP备2026020023号
      </a>
    </div>
  );
}
