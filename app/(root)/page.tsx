// app/(root)/page.tsx

import Link from "next/link";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import InterviewCard from "@/components/InterviewCard";

import { getCurrentUser } from "@/lib/actions/auth.action";
import {
  getInterviewsByUserId,
  getLatestInterviews,
  getFeedbackByInterviewId,
} from "@/lib/actions/general.action";

async function Home() {
  const user = await getCurrentUser();
  const userId = user?.id!;

  // 1. Fetch your interviews + all latest interviews
  const [userInterviews, allInterviews] = await Promise.all([
    getInterviewsByUserId(userId),
    getLatestInterviews({ userId }),
  ]);

  const allInterviewList = [...(userInterviews ?? []), ...(allInterviews ?? [])];

  // 2. For all interviews, check if feedback exists
  const feedbackList = await Promise.all(
    allInterviewList.map((interview) =>
      getFeedbackByInterviewId({ interviewId: interview.id, userId })
    )
  );

  const attemptedInterviews = allInterviewList.filter((_, idx) => feedbackList[idx]);
  const notAttemptedInterviews = allInterviewList.filter((_, idx) => !feedbackList[idx]);

  const hasPastInterviews = attemptedInterviews.length > 0;
  const hasUpcomingInterviews = notAttemptedInterviews.length > 0;

  return (
    <>
      <section className="card-cta">
        <div className="flex flex-col gap-6 max-w-lg">
          <h2>Get Interview-Ready with AI-Powered Questioning & Feedback</h2>
          <p className="text-lg">
            Face Real Interview Questions & get instant feedback
          </p>

          <Button asChild className="btn-primary max-sm:w-full">
            <Link href="/interview">Start an Interview</Link>
          </Button>
        </div>

        <Image
          src="/robot.png"
          alt="robo-dude"
          width={400}
          height={400}
          className="max-sm:hidden"
        />
      </section>

      <section className="flex flex-col gap-6 mt-8">
        <h2>Your Interviews</h2>

        <div className="interviews-section">
          {hasPastInterviews ? (
            attemptedInterviews.map((interview) => (
              <InterviewCard
                key={interview.id}
                userId={userId}
                interviewId={interview.id}
                role={interview.role}
                type={interview.type}
                techstack={interview.techstack}
                createdAt={interview.createdAt}
              />
            ))
          ) : (
            <p>You haven&apos;t taken any interviews yet</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-6 mt-8">
        <h2>Take Interviews</h2>

        <div className="interviews-section">
          {hasUpcomingInterviews ? (
            notAttemptedInterviews.map((interview) => (
              <InterviewCard
                key={interview.id}
                userId={userId}
                interviewId={interview.id}
                role={interview.role}
                type={interview.type}
                techstack={interview.techstack}
                createdAt={interview.createdAt}
              />
            ))
          ) : (
            <p>There are no interviews available</p>
          )}
        </div>
      </section>
    </>
  );
}

export default Home;
