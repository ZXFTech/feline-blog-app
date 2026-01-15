"use client";

import { useRouter } from "next/navigation";
import React from "react";
import { PermissionAccess } from "../Auth/PermissionAccess";
import NeuButton from "../NeuButton";
import classNames from "classnames";
import { favoriteBlog, likeBlog } from "@/db/blogAction";
import logger from "@/lib/logger/Logger";
import { toast } from "../ProMessage";

interface Props {
  likes: number;
  favorite: number;
  id: number;
  isLiked: boolean;
  isFavorite: boolean;
}

function BlogOperationBar({ likes, favorite, id, isFavorite, isLiked }: Props) {
  const router = useRouter();
  const handleLike = async () => {
    try {
      await likeBlog(id, !isLiked);
      router.refresh();
    } catch (error) {
      logger.error(`${isLiked ? "" : "取消"}点赞失败,`, error);
      toast.error(`${isLiked ? "" : "取消"}点赞失败,`);
    }
  };

  const handleFavorite = async () => {
    try {
      await favoriteBlog(id, !isFavorite);
      router.refresh();
    } catch (error) {
      logger.error(`${isFavorite ? "" : "取消"}收藏失败,`, error);
      toast.error(`${isFavorite ? "" : "取消"}收藏失败,`);
    }
  };

  return (
    <div className="flex flex-row justify-center items-center gap-2">
      {/* <Link href="/blog/new" className="hover:no-underline!"> */}
      <PermissionAccess>
        <NeuButton
          btnSize="xl"
          icon="favorite"
          className={classNames({
            // "bg-red-500!": isLiked,
            "text-red-500!": isLiked,
          })}
          onClick={handleLike}
        >
          <span className="font-medium tracking-wider">{likes}</span>
        </NeuButton>
        <NeuButton
          btnSize="xl"
          className={classNames({
            // "bg-red-500!": isLiked,
            "text-blue-500!": isFavorite,
          })}
          icon={`${isFavorite ? "bookmark_added" : "bookmark_add"}`}
          onClick={handleFavorite}
        >
          <span className="font-medium tracking-wider">{favorite}</span>
        </NeuButton>
        <NeuButton
          btnSize="xl"
          icon="share"
          className="color-cycle rounded-full!"
        ></NeuButton>
      </PermissionAccess>
      {/* </Link> */}
    </div>
  );
}

export default BlogOperationBar;
