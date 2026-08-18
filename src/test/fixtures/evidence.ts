import type { CvDocument } from '@/features/CV/document';
import type { OfferSnapshot, EvidenceCvProposal } from '@/features/Submitting/types';

export const cvFixture = (language: 'en' | 'pl' = 'en'): CvDocument => ({
  version: 1,
  updated_at: '2026-01-02T03:04:05.000Z',
  personal: {
    name: 'Ada Żółć',
    email: 'ada@example.com',
    phone: '+48 123 456 789',
    location: 'Warsaw, Poland',
    links: { portfolio: 'example.com/żółć' }
  },
  role_description:
    language === 'pl'
      ? 'Tworzę dostępne aplikacje internetowe w React i TypeScript.'
      : 'I build accessible web applications with React and TypeScript.',
  skills: {
    role: language === 'pl' ? 'Frontend Developerka' : 'Frontend Developer',
    groups: [
      { label: language === 'pl' ? 'Technologie' : 'Technologies', items: ['React', 'TypeScript'] },
      { label: language === 'pl' ? 'Narzędzia' : 'Tools', items: ['Git'] }
    ]
  },
  experience: [
    {
      company: 'Example S.A.',
      title: 'Frontend Developer',
      started: 'January 2022',
      finished: null,
      highlights: [
        'Built accessible React interfaces used by internal teams.',
        'Migrated JavaScript modules to TypeScript with peer review.'
      ],
      skills: ['React', 'TypeScript']
    },
    {
      company: 'Earlier Ltd',
      title: 'Web Developer',
      started: 'June 2020',
      finished: 'December 2021',
      highlights: ['Maintained standards-based web pages with Git.'],
      skills: ['Git']
    }
  ],
  education: [
    {
      university: 'Warsaw University of Technology',
      degree: 'MSc Computer Science',
      started: '2015',
      finished: '2020',
      thesis: 'Accessible interfaces',
      mark: '5.0'
    }
  ],
  certificates: [
    { name: 'Web Accessibility', issuer: 'Example Org', started: '2025', finished: null }
  ],
  languages: [
    { name: language === 'pl' ? 'Polski' : 'Polish', level: 'Native' },
    { name: language === 'pl' ? 'Angielski' : 'English', level: 'C1' }
  ],
  sources: [{ kind: 'fixture', reference: 'cv', imported_at: '2026-01-01T00:00:00.000Z' }]
});

export const offerFixture = (): OfferSnapshot => ({
  company: 'Hiring Co',
  company_type: 'Product company',
  company_size: '100',
  position: 'Frontend Developer',
  role_profile: 'Frontend Developer (React, TypeScript)',
  seniority: 'Mid',
  location: 'Warsaw',
  work_mode: 'hybrid',
  salary: 'Not stated',
  contract_type: 'Employment',
  engagement_length: 'Permanent',
  start_date: 'Not stated',
  ideal_candidate: 'A frontend developer with React experience.',
  responsibilities: ['Build accessible interfaces'],
  team: 'Product team',
  how_to_apply: 'Application form',
  required_skills: ['React', 'Kubernetes'],
  requirements: [
    {
      id: 'req-react',
      exactText: 'React',
      sourceQuote: 'Strong React knowledge',
      category: 'skill',
      priority: 'required'
    },
    {
      id: 'req-kubernetes',
      exactText: 'Kubernetes',
      sourceQuote: 'Kubernetes is nice to have',
      category: 'skill',
      priority: 'preferred'
    }
  ],
  source_url: 'https://jobs.example/frontend',
  locale: 'en',
  offer_text: 'Strong React knowledge. Kubernetes is nice to have.'
});

export const proposalFixture = (): EvidenceCvProposal => ({
  headline: {
    text: 'Frontend Developer',
    evidenceIds: ['role:0'],
    requirementIds: ['req-react']
  },
  summaryClaims: [
    {
      text: 'I build accessible React interfaces for internal teams.',
      evidenceIds: ['experience:0:bullet:0', 'skill:0:0'],
      requirementIds: ['req-react']
    },
    {
      text: 'I migrate JavaScript modules to TypeScript with peer review.',
      evidenceIds: ['experience:0:bullet:1', 'skill:0:1'],
      requirementIds: []
    }
  ],
  skills: [
    { evidenceId: 'skill:0:0', requirementIds: ['req-react'] },
    { evidenceId: 'skill:0:1', requirementIds: [] },
    { evidenceId: 'skill:1:0', requirementIds: [] }
  ],
  experience: [
    {
      jobIndex: 0,
      bullets: [
        {
          sourceEvidenceId: 'experience:0:bullet:0',
          text: 'Built accessible React interfaces used by internal teams.',
          evidenceIds: ['experience:0:bullet:0', 'skill:0:0'],
          requirementIds: ['req-react']
        }
      ]
    },
    {
      jobIndex: 1,
      bullets: [
        {
          sourceEvidenceId: 'experience:1:bullet:0',
          text: 'Maintained standards-based web pages with Git.',
          evidenceIds: ['experience:1:bullet:0', 'skill:1:0'],
          requirementIds: []
        }
      ]
    }
  ],
  requirementMatches: [
    {
      requirementId: 'req-react',
      status: 'direct',
      evidenceIds: ['skill:0:0', 'experience:0:bullet:0'],
      explanation: 'React is stated in skills and work evidence.'
    },
    {
      requirementId: 'req-kubernetes',
      status: 'missing',
      evidenceIds: [],
      explanation: 'Kubernetes is not present in the CV.'
    }
  ]
});
