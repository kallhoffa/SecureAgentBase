const Step1 = ({ expanded, user }) => {
  if (!expanded) return null;

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 -mt-2">
      {user ? (
        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-4 rounded-lg">
          <Check size={20} />
          <span className="font-medium">Signed in as {user.email}</span>
        </div>
      ) : (
        <p className="text-gray-600">Please sign in to continue.</p>
      )}
    </div>
  );
};

export default Step1;
