export const dynamic = 'force-dynamic';

export default function TeamsLayout({ children }) {
  return (
    <div className='pt-8 flex flex-col min-h-screen'>
      {/* Ya no están las pestañas aquí */}
      <div className='w-full max-w-[1400px] mx-auto mt-2 px-6 lg:px-10 min-w-0'>
        {children}
      </div>
    </div>
  );
}