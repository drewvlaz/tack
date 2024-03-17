'use client';

import React, { useState } from 'react';

interface PieceProps {
  name: string;
  brand: string;
  material: string;
  description: string;
  images: string[];
};

const Piece = (props: PieceProps) => {
  const [name, setName] = useState(props.name);
  const [brand, setBrand] = useState(props.brand);
  const [material, setMaterial] = useState(props.material);
  const [description, setDescription] = useState(props.description);
  const [images, setImages] = useState<string[]>(props.images);

  const [isHovered, setIsHovered] = useState(false);
  const handleMouseEnter = () => {
    setIsHovered(true);
    console.log("Mouse is over the image.");
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    console.log("Mouse has left the image.");
  };

  return (
    <div className="text-gray-700">
      {images.length > 0 && (
        <div>
          {images.map((image, index) => (
            <>
              <div>Image {index + 1}:</div>
              <img
                key={index}
                src={image}
                className="rounded-[36px] shadow-xl"
                alt="Product image"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                width={500}
                height={500} />
            </>
          ))}
        </div>
      )}
      <p>Name: {name}</p>
      <p>Brand: {brand}</p>
      <p>Material: {material}</p>
      <p>Description: {description}</p>
      {isHovered && <h1>Add pop up now</h1>}
    </div>
  )

};

export default Piece;
