"use client";

// import Image from 'next/image'; // enforces cors policy, cant use for now
import React, { useState } from "react";
import parseData from "@/app/actions";
import Piece from "@/components/ui/piece";

const Test = () => {
  const [pieces, setPieces] = useState<JSX.Element[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    setLoading(true);
    // Prevent the default form submit behavior which refreshes the page
    event.preventDefault();

    try {
      const input = (event.target as HTMLFormElement).prompt.value;
      console.log("Calling server function on input:", input);
      const result = await parseData(input);

      if (result === null) {
        console.log("Result is null, skipping rendering.");
        return;
      }

      console.log(result);
      result["images"].forEach((image: string) => {
        console.log(image);
      });
      setPieces((prevItems) => [
        ...prevItems,
        <Piece
          key={result["name"]}
          name={result["name"]}
          brand={result["brand"]}
          material={result["material"]}
          description={result["description"]}
          images={result["images"]}
          link={input}
        />,
      ]);
      console.log(result["images"][0]);
    } catch (error) {
      console.error("Failed to call server function:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container m-10 mx-auto rounded-xl border bg-gray-200 p-8 shadow">
      <p className="mb-5 text-3xl font-bold text-gray-700">
        Add a link to a product page
      </p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          id="prompt"
          name="prompt"
          className="focus:shadow-outline w-full appearance-none rounded border px-3 py-2 leading-tight text-gray-700 shadow focus:outline-none"
          required
        />
        <button
          type="submit"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
        >
          {loading ? "Loading..." : "Add"}
        </button>
      </form>
      <div className="mt-5 grid grid-cols-4">
        {pieces.length > 0 &&
          pieces.map((piece, index) => <div key={index}>{piece}</div>)}
      </div>
    </div>
  );
};

export default Test;
