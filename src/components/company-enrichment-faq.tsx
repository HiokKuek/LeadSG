"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

type FaqItem = {
  question: string;
  answer: string;
};

export function CompanyEnrichmentFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FaqItem[] = [
    {
      question: "What is SSIC?",
      answer:
        "SSIC stands for Singapore Standard Industrial Classification. It is a 5-digit industry code used to classify business activities in Singapore. Example codes include 62011 (software development), 62012 (game development), and 63110 (data processing).",
    },
    {
      question: "I want the details of the companies, how much does it cost?",
      answer: "We provide the information of the companies, sorted by SSIC for free. This is provided that you are an authenticated user.",
    },
    {
      question: "I want the contact details of the companies (phone number and website), how much does it cost?",
      answer: "Pricing is USD 20 per 1000 queries. We are currently looking at ways to reduce this cost.",
    },
    {
      question: "How do I contact support?",
      answer: "You can email ernest.tanhk@gmail.com.",
    },
    {
      question: "How long will it take to retrieve contact details of companies?",
      answer:
        "After payment is confirmed, we will provide you with a confirmation code. You may use this code to start the job and we will start retrieving company details asynchronously.",
    },
    {
      question: "Will every company have phone and website data?",
      answer:
        "Not always. Availability depends on listing quality and public data coverage for each business. From our experience, we are typically able to retrieve 90% of phone numbers given a list of companies with the same SSIC.",
    },
  ];

  return (
    <section className="mt-8 w-full">
      <h2 className="text-2xl font-bold text-zinc-900">Q&A</h2>

      <div className="mt-5 space-y-3">
        {faqs.map((item, index) => {
          const isOpen = openIndex === index;

          return (
            <div key={item.question} className="rounded-lg border border-zinc-200">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-zinc-900">{item.question}</span>
                <ChevronDown
                  className={`h-4 w-4 text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="border-t border-zinc-200 px-4 py-3 text-sm text-zinc-700">
                  <p>{item.answer}</p>

                  {item.question === "What is SSIC?" && (
                    <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      For the comprehensive SSIC mapping, view
                      {" "}
                      <a
                        href="/ssic.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-700 underline underline-offset-2"
                      >
                        ssic.pdf
                      </a>
                      .
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
