import React, { useState } from 'react';
import { X, Star } from 'lucide-react';

export default function App() {
  // 默认设为 true 以便预览时直接看到效果
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans">
      {/* 触发抽屉的按钮 */}
      <button
        onClick={() => setIsOpen(true)}
        className="px-6 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-md hover:bg-zinc-800 transition-colors shadow-sm"
      >
        打开电影详情
      </button>

      {/* 抽屉面板 */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[480px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        {/* 头部信息 (固定悬浮) */}
        <div className="relative px-6 pt-8 pb-5 shrink-0 bg-white z-10 border-b border-zinc-200/80 shadow-[0_4px_12px_-6px_rgba(0,0,0,0.05)]">
          <button
            onClick={() => setIsOpen(false)}
            className="absolute top-4 right-4 p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 rounded-full transition-colors"
          >
            <X size={20} />
          </button>

          <h1 className="text-2xl font-bold text-zinc-900 pr-8 leading-tight">
            COLORFUL STAGE! The Movie: A Miku Who Can't Sing
          </h1>
          <p className="text-sm text-zinc-500 mt-2 font-medium">
            劇場版プロジェクトセカイ 壊れたセカイと歌えないミク
          </p>

          {/* 评分与基础信息 */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-sm text-zinc-800 font-medium">
            <div className="flex items-center gap-1">
              <Star size={16} className="fill-zinc-900 text-zinc-900" />
              <span>7.6</span>
            </div>
            <span className="text-zinc-500">35 votes</span>
            <span>Jan 17, 2025</span>
          </div>

          {/* 标签 */}
          <div className="flex flex-wrap gap-2 mt-4">
            {['Animation', 'Music', 'Drama', 'Science Fiction'].map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-zinc-200/70 text-zinc-700 text-xs font-medium rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* 可滚动的内容区 (隐藏滚动条) */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {/* 海报 */}
          <div className="px-6 pt-6 pb-2">
            {/* 这里使用 CSS 渐变模拟海报占位，实际开发时替换为 img 标签即可 */}
            <div className="w-full aspect-[2/3] rounded-xl overflow-hidden shadow-sm relative group bg-gradient-to-br from-blue-400 via-cyan-600 to-indigo-900 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/10"></div>
              <span className="text-white/70 font-medium tracking-widest text-sm z-10 border border-white/30 px-4 py-2 rounded-md backdrop-blur-sm">
                POSTER IMAGE
              </span>
              {/* 实际使用：
             <img src="/path/to/poster.jpg" alt="Poster" className="w-full h-full object-cover" /> 
             */}
            </div>
          </div>

          {/* 引言 / Slogan */}
          <div className="px-6 py-4">
            <blockquote className="border-l-[3px] border-zinc-300 pl-4 text-zinc-500 italic text-[15px]">
              "My voice cannot reach anyone."
            </blockquote>
          </div>

          {/* 剧情简介 */}
          <div className="px-6 py-4">
            <h3 className="text-xs font-bold text-zinc-400 tracking-wider mb-3 uppercase">
              Overview
            </h3>
            <p className="text-zinc-700 text-[15px] leading-relaxed">
              Ichika is a high school musician who can enter a mysterious place called
              "SEKAI," where she and her friends express their innermost emotions
              through music alongside Hatsune Miku. One day after giving a live
              performance, Ichika meets a new Miku that she has never seen before. No
              matter how hard this new Miku tries to sing, she struggles connecting
              with the hearts of her listeners. Miku must rely on the help of others
              to find a way to sing again.
            </p>
          </div>

          {/* 详情网格 */}
          <div className="px-6 py-4">
            <h3 className="text-xs font-bold text-zinc-400 tracking-wider mb-4 uppercase">
              Details
            </h3>
            <div className="grid grid-cols-2 gap-y-5 gap-x-4">
              <div>
                <p className="text-[13px] font-semibold text-zinc-900">Runtime</p>
                <p className="text-[15px] text-zinc-500 mt-0.5">105 min</p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-900">Language</p>
                <p className="text-[15px] text-zinc-500 mt-0.5">JA</p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-900">Director</p>
                <p className="text-[15px] text-zinc-500 mt-0.5">Hiroyuki Hata</p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-900">Writers</p>
                <p className="text-[15px] text-zinc-500 mt-0.5">Yoko Yonaiyama</p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-900">Revenue</p>
                <p className="text-[15px] text-zinc-500 mt-0.5">$12,309,765</p>
              </div>
            </div>
          </div>

          {/* 演职员表 */}
          <div className="px-6 py-4 pb-12">
            <h3 className="text-xs font-bold text-zinc-400 tracking-wider mb-4 uppercase">
              Cast
            </h3>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {[
                'Yuu Asakawa',
                'Ai Furihata',
                'Naoto Fuuga',
                'Fumiya Imai',
                'Daisuke Hirose',
                'Rina Honnizumi',
                'Megumi Ogata',
                'Rie Kugimiya',
              ].map((actor, index) => (
                <li key={index} className="text-[14px] text-zinc-800 flex items-center">
                  <span className="text-zinc-400 w-5 inline-block mr-1 text-sm shrink-0">{index + 1}.</span>
                  <span className="truncate" title={actor}>{actor}</span>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}