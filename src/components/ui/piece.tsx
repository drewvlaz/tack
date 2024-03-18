"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

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

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Image
          key={name}
          src={images[0]}
          className="rounded-[36px] shadow-xl"
          alt="Product image"
          // onMouseEnter={handleMouseEnter}
          // onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          width={200}
          height={200}
        />
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="text-gray-700">
          <h1>
            Name: {name} ({brand})
          </h1>
          <p>Material: {material}</p>
          <p>Description: {description}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default Piece;
