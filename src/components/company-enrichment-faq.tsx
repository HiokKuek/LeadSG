"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

type FaqItem = {
  question: string;
  answer: string;
};

export function CompanyEnrichmentFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [ssicLookupQuery, setSsicLookupQuery] = useState("");

  const ssicReference = useMemo(
    () => [
      { code: "62011", title: "Development of software and applications (except games and cybersecurity)" },
      { code: "62012", title: "Development of computer games" },
      { code: "62013", title: "Development of software for cybersecurity" },
      { code: "62021", title: "Information technology consultancy (except cybersecurity)" },
      { code: "62022", title: "Information technology cybersecurity consultancy" },
      { code: "62023", title: "Computer facilities management activities" },
      { code: "63110", title: "Data analytics, processing and related activities" },
      { code: "70201", title: "Management consultancy services" },
      { code: "74191", title: "Interior design services" },
      { code: "46900", title: "Wholesale trade of a variety of goods without a dominant product" },
    ],
    [],
  );

  const filteredSsicReference = useMemo(() => {
    const query = ssicLookupQuery.trim().toLowerCase();
    if (!query) return ssicReference;

    return ssicReference.filter((item) =>
      item.code.includes(query) || item.title.toLowerCase().includes(query),
    );
  }, [ssicLookupQuery, ssicReference]);

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
                    <div className="mt-3">
                      <label className="mb-2 block text-xs font-medium text-zinc-700">Quick SSIC lookup</label>
                      <input
                        value={ssicLookupQuery}
                        onChange={(event) => setSsicLookupQuery(event.target.value)}
                        placeholder="Search by code or keyword (e.g. 62011 or software)"
                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2">
                        {filteredSsicReference.length === 0 ? (
                          <p className="text-xs text-zinc-500">No matching SSIC found in quick reference list.</p>
                        ) : (
                          filteredSsicReference.map((entry) => (
                            <p key={entry.code} className="py-1 text-xs text-zinc-700">
                              <span className="font-semibold text-zinc-900">{entry.code}</span> — {entry.title}
                            </p>
                          ))
                        )}
                      </div>
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
