import NeuDiv from "@/components/NeuDiv";
import Image from "next/image";

import {
  LogoGithub,
  LogoGmail,
  LogoMysql,
  LogoNextjs,
  LogoNodejs,
  LogoQQ,
  LogoQQMail,
  LogoReact,
  LogoSass,
  LogoSteam,
  LogoTailwind,
  LogoUniApp,
  LogoVue,
  LogoWeChat,
} from "../Logo/svg";
import NeuButton from "../NeuButton";

// const welcome = [
//   "有朋自远方来, 不亦乐乎",
//   "We warmly welcome your visit.",
//   "Мы рады приветствовать вас.",
//   "ご来訪を心より歓迎いたします。",
// ];

export const ProfileCard = () => {
  // 先放页面上, 后续放到数据库里
  return (
    <div className="profile-container relative mx-2 flex flex-col px-4 h-full gap-4">
      <div className="flex items-center justify-between items-stretch justify-items-stretch">
        <NeuDiv
          neuType="embossed"
          intensity="sm"
          className="avatar w-fit p-3 rounded-xl!"
        >
          <Image
            className="rounded-md"
            src={"/avatar.jpg"}
            width={100}
            height={100}
            alt="avatar"
          />
        </NeuDiv>
        <div className="signature h-full mb-2 text-lg font-medium grow p-2 relative">
          <span className="signature-text h-full flex justify-center items-center">
            <span className="font-ma-shan-zheng text-2xl">
              道阻且长, <span className="text-red-800">行</span>则将至.
            </span>
          </span>
          <div className="absolute right-0 bottom-0 text-sm flex items-center">
            <span>——— 试着做一个长期主义者.</span>
            <span className="cursor h-4 w-0.5 inline-block ml-1" />
          </div>
        </div>
      </div>

      <div className="introduce mb-2 text-md font-medium flex flex-wrap items-center justify-around">
        <LogoReact className="h-5" />
        <LogoNextjs className="h-3" />
        <div className="flex gap-1">
          <LogoVue className="h-5" />
          <span className="vue-color">Vue.js</span>
        </div>
        <LogoNodejs className="h-7" />
        <LogoTailwind className="h-4" />
        <LogoSass className="h-6" />
        <LogoMysql className="h-6" />
        <div className="flex gap-1">
          <LogoUniApp className="h-5 w-4" />
          <span className="uni-app-color">uni-app</span>
        </div>
      </div>
      <div className="dedication   rounded-lg flex flex-col items-center justify-center text-sm text-white! relative">
        <div className="w-[600px] relative rounded-2xl overflow-hidden">
          <div className="neon-green absolute right-[16%] top-[41%] rounded-full w-4 h-4"></div>
          <Image
            className=""
            src={"/traffic-light.png"}
            alt="traffic-light"
            width={600}
            height={500}
          />
          <div className="flex flex-col items-start justify-center absolute left-[10%] top-[35%]">
            <span>欢迎你，远方的朋友。</span>
            <span>市井喧阗，车马填咽。</span>
            <span>愿你</span>
            <span>初心如磐，行稳致远；所行皆顺，所愿皆成。</span>
          </div>
        </div>
      </div>

      <div className="connect flex gap-4 justify-center items-center">
        <NeuButton className="rounded-full! p-1! border-">
          <LogoWeChat className="h-6 w-6 cursor-pointer" />
        </NeuButton>
        <NeuButton className="rounded-full! p-1! border-">
          <LogoQQ className="h-6 w-6 cursor-pointer" />
        </NeuButton>
        <NeuButton className="rounded-full! p-1! border-">
          <LogoQQMail className="h-6 w-6 cursor-pointer" />
        </NeuButton>
        <NeuButton className="rounded-full! p-1! border-">
          <LogoGmail className="h-6 w-6 cursor-pointer" />
        </NeuButton>
        <NeuButton className="rounded-full! p-1! border-">
          <a
            href="https://github.com/ZXFTech"
            target="_blank"
            rel="noopener noreferrer"
          >
            <LogoGithub className="h-6 w-6 cursor-pointer" />
          </a>
        </NeuButton>
        <NeuButton className="rounded-full! p-1! border-">
          <a
            href="https://steamcommunity.com/profiles/76561198257471864/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <LogoSteam className="h-6 w-6 cursor-pointer" />
          </a>
        </NeuButton>
      </div>
    </div>
  );
};
