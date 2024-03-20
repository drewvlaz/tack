"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

import HoverCardV2 from "@/components/hovercard-v2";

type PieceProps = {
  name: string;
  brand: string;
  material: string;
  description: string;
  link: string;
  images: string[];
};

const Piece = (props: PieceProps) => {
  const [name, setName] = useState(props.name);
  const [brand, setBrand] = useState(props.brand);
  const [material, setMaterial] = useState(props.material);
  const [description, setDescription] = useState(props.description);
  const [images, setImages] = useState<string[]>(props.images);

  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    console.log("Mouse is over the image.");
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    console.log("Mouse has left the image.");
  };

  const handleClick = () => {
    setIsClicked(true);
    console.log("Clicked on the image.");
    console.log(props.link);
    window.open(props.link, "_blank");
  };

  const imageLoader = ({
    src,
    width,
    quality,
  }: {
    src: string;
    width: number;
    quality: number;
  }) => {
    return `https://res.cloudinary.com/demo/image/fetch/${src}`;
  };

  return <HoverCardV2 name={name} image={images[0]} />;
};

export default Piece;
