import { Check, AlertTriangle } from 'lucide-react';

const StepHeader = ({ stepNumber, title, icon, isComplete, isActive, isLocked, info, isWarning = false, onEdit = null, expandedSteps, toggleStep }) => {
  const baseClasses = "flex items-center justify-between w-full p-4 rounded-lg transition-all duration-200";
  let bgClasses = "bg-gray-50";
  let borderClasses = "border border-gray-200";
  let textClasses = "text-gray-500";
  let iconColor = "text-gray-400";

  if (isWarning) {
    bgClasses = "bg-yellow-50";
    borderClasses = "border-2 border-yellow-500";
    textClasses = "text-yellow-700";
    iconColor = "text-yellow-600";
  } else if (isComplete) {
    bgClasses = "bg-green-50";
    borderClasses = "border-2 border-green-500";
    textClasses = "text-green-700";
    iconColor = "text-green-600";
  } else if (isActive) {
    bgClasses = "bg-blue-50";
    borderClasses = "border-2 border-blue-500";
    textClasses = "text-blue-700";
    iconColor = "text-blue-600";
  } else if (isLocked) {
    bgClasses = "bg-gray-50 opacity-60";
    borderClasses = "border border-gray-200";
  }

  const handleHeaderClick = () => {
    if (isLocked) return;
    toggleStep(stepNumber);
  };

  return (
    <div className={`${baseClasses} ${bgClasses} ${borderClasses} ${isLocked ? 'opacity-60' : ''}`}>
      <button
        onClick={handleHeaderClick}
        disabled={isLocked}
        className={`flex items-center gap-3 flex-1 text-left ${isLocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {isComplete || isWarning ? (isWarning ? <AlertTriangle className={iconColor} size={24} /> : <Check className={iconColor} size={24} />) : icon}
        <span className={`font-semibold ${textClasses}`}>{title}</span>
        {isWarning && <span className="text-xs text-yellow-600 ml-2">(Re-authentication required)</span>}
        {isLocked && <span className="text-xs text-gray-400 ml-2">(Complete previous step first)</span>}
        {info && (
          <div className="relative group">
            <svg className={`w-4 h-4 ${textClasses} cursor-help`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {info}
            </div>
          </div>
        )}
      </button>
      <div className="flex items-center gap-2">
        {isComplete && onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className={`p-1.5 rounded hover:bg-green-100 text-green-600`}
            title="Edit step"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
        {expandedSteps.includes(stepNumber) ? (
          <svg className={`w-5 h-5 ${textClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        ) : (
          <svg className={`w-5 h-5 ${textClasses}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
    </div>
  );
};

export default StepHeader;
